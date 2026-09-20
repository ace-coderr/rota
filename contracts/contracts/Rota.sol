// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Rota
 * @notice A non-custodial rotating savings circle (ROSCA) settled in USDC.
 *
 * @dev Core invariant: Rota NEVER holds USDC.
 *
 * Every movement of value is a `transferFrom` from one member's wallet
 * straight into the recipient's wallet. Rota is only ever the `spender` of an
 * allowance; it is never the `from` and never the `to`. Consequently this
 * contract has:
 *
 *   - no `receive` or `fallback` function,
 *   - no withdraw, sweep or rescue function,
 *   - no call to `transfer` on its own balance,
 *   - no owner, admin, pauser or any other privileged address.
 *
 * There is no collateral, no slashing, no penalty and no pause. A member's
 * only exposure is the allowance they choose to grant, which they can revoke
 * at any time directly on the USDC contract.
 *
 * On Arc, `usdc` is the ERC-20 predeploy at
 * 0x3600000000000000000000000000000000000000 with 6 decimals. All amounts in
 * this contract are USDC base units. The 18-decimal native gas balance is
 * never read or written here.
 */
contract Rota is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Circle {
        address[] members; // ordered; this is the payout rotation
        uint256 contribution; // USDC base units, 6 decimals
        uint64 period; // seconds between cycles
        uint64 nextDueAt;
        uint32 cycleIndex;
        bool started;
    }

    /// @notice Per-member readiness for the upcoming round, for UI preflight.
    struct MemberStatus {
        address member;
        uint256 allowance;
        uint256 balance;
        bool ready;
    }

    /**
     * @notice Hard cap on circle size.
     * @dev {disburse} loops over every member, so an unbounded circle could be
     * created that costs more gas to settle than a block allows, leaving it
     * permanently stuck. 20 keeps a full cycle comfortably inside a block.
     */
    uint256 public constant MAX_MEMBERS = 20;

    /// @notice The USDC token every circle settles in.
    IERC20 public immutable usdc;

    /// @notice Total circles ever created; ids are sequential from 0.
    uint256 public circleCount;

    mapping(uint256 => Circle) private _circles;

    event CircleCreated(
        uint256 indexed circleId,
        address[] members,
        uint256 contribution,
        uint64 period
    );
    event Started(uint256 indexed circleId, uint64 nextDueAt);
    event Disbursed(
        uint256 indexed circleId,
        uint32 indexed cycleIndex,
        address indexed recipient,
        uint256 totalPaid
    );

    error ZeroToken();
    error UnknownCircle(uint256 circleId);
    error TooFewMembers(uint256 provided);
    error TooManyMembers(uint256 provided);
    error DuplicateMember(address member);
    error ZeroAddressMember();
    error ZeroContribution();
    error ZeroPeriod();
    error NotAMember(address caller);
    error AlreadyStarted();
    error NotStarted();
    error InsufficientAllowanceToStart(
        address member,
        uint256 allowance,
        uint256 required
    );
    error NotDue(uint256 timestamp, uint64 nextDueAt);
    error CircleComplete();

    constructor(IERC20 usdc_) {
        if (address(usdc_) == address(0)) revert ZeroToken();
        usdc = usdc_;
    }

    /**
     * @notice Create a circle. Creating costs nothing and moves no value.
     * @param members Ordered rotation: members[i] is paid in cycle i. Between
     * 2 and {MAX_MEMBERS} entries, no duplicates, no zero address.
     * @param contribution Per-member, per-cycle amount in USDC base units.
     * @param period Seconds between cycles.
     */
    function createCircle(
        address[] calldata members,
        uint256 contribution,
        uint64 period
    ) external returns (uint256 circleId) {
        uint256 n = members.length;
        if (n < 2) revert TooFewMembers(n);
        if (n > MAX_MEMBERS) revert TooManyMembers(n);
        if (contribution == 0) revert ZeroContribution();
        if (period == 0) revert ZeroPeriod();

        for (uint256 i = 0; i < n; ++i) {
            address member = members[i];
            if (member == address(0)) revert ZeroAddressMember();
            for (uint256 j = i + 1; j < n; ++j) {
                if (members[j] == member) revert DuplicateMember(member);
            }
        }

        circleId = circleCount++;

        Circle storage circle = _circles[circleId];
        circle.members = members;
        circle.contribution = contribution;
        circle.period = period;

        emit CircleCreated(circleId, members, contribution, period);
    }

    /**
     * @notice Start a circle. Callable by any member once every member has
     * granted Rota an allowance of at least `contribution * (members - 1)`,
     * which is the total each member pays across a full rotation.
     * @dev Moves no value. It only reads allowances.
     */
    function start(uint256 circleId) external {
        Circle storage circle = _circles[circleId];
        uint256 n = circle.members.length;
        if (n == 0) revert UnknownCircle(circleId);
        if (circle.started) revert AlreadyStarted();
        if (!_isMember(circle, msg.sender)) revert NotAMember(msg.sender);

        uint256 required = circle.contribution * (n - 1);
        for (uint256 i = 0; i < n; ++i) {
            address member = circle.members[i];
            uint256 allowed = usdc.allowance(member, address(this));
            if (allowed < required) {
                revert InsufficientAllowanceToStart(member, allowed, required);
            }
        }

        circle.started = true;
        circle.nextDueAt = uint64(block.timestamp) + circle.period;

        emit Started(circleId, circle.nextDueAt);
    }

    /**
     * @notice Settle one cycle: every member except the recipient pays the
     * recipient directly. Callable by anyone, because the schedule decides who
     * gets paid, not the caller.
     *
     * @dev All of it is atomic. If any single transfer fails the whole call
     * reverts and nobody pays. State is advanced before any transfer
     * (checks-effects-interactions), and USDC never touches this contract.
     */
    function disburse(uint256 circleId) external nonReentrant {
        Circle storage circle = _circles[circleId];
        uint256 n = circle.members.length;
        if (n == 0) revert UnknownCircle(circleId);
        if (!circle.started) revert NotStarted();

        uint32 index = circle.cycleIndex;
        if (index >= n) revert CircleComplete();
        if (block.timestamp < circle.nextDueAt) {
            revert NotDue(block.timestamp, circle.nextDueAt);
        }

        address recipient = circle.members[index];
        uint256 contribution = circle.contribution;

        // Effects first: advance the rotation and the schedule before any
        // external call.
        //
        // The schedule normally accumulates, so a slightly late disburse does
        // not push the circle's cadence back. But if a whole period has
        // already elapsed on top of the due date, accumulating would leave
        // the next cycle instantly due — and a circle left idle for months
        // could be drained cycle after cycle in a single block. In that case
        // the schedule catches up to now instead.
        circle.cycleIndex = index + 1;
        if (block.timestamp >= circle.nextDueAt + circle.period) {
            circle.nextDueAt = uint64(block.timestamp) + circle.period;
        } else {
            circle.nextDueAt += circle.period;
        }

        uint256 totalPaid;
        for (uint256 i = 0; i < n; ++i) {
            address member = circle.members[i];
            if (member == recipient) continue;
            // Wallet to wallet. Rota is only the spender.
            usdc.safeTransferFrom(member, recipient, contribution);
            totalPaid += contribution;
        }

        emit Disbursed(circleId, index, recipient, totalPaid);
    }

    /**
     * @notice Per-member readiness for the next state transition, so the UI can
     * name exactly who is short before anyone signs anything.
     *
     * @dev Never reverts. A short, broke or unknown member is reported, not
     * thrown. Before the circle starts, `ready` mirrors what {start} demands
     * (allowance for a full rotation) plus enough balance for the first cycle.
     * Once started, it mirrors what the next {disburse} demands; the member due
     * to be paid this cycle pays nothing and is always ready. An unknown
     * circle yields an empty array.
     */
    function previewRound(
        uint256 circleId
    ) external view returns (MemberStatus[] memory statuses) {
        Circle storage circle = _circles[circleId];
        uint256 n = circle.members.length;
        statuses = new MemberStatus[](n);
        if (n == 0) return statuses;

        uint256 contribution = circle.contribution;
        bool started = circle.started;
        bool complete = circle.cycleIndex >= n;
        address recipient = complete
            ? address(0)
            : circle.members[circle.cycleIndex];

        uint256 required = contribution;
        if (!started) {
            // Saturate rather than overflow: this view must never revert.
            unchecked {
                uint256 total = contribution * (n - 1);
                required = total / (n - 1) == contribution
                    ? total
                    : type(uint256).max;
            }
        }

        for (uint256 i = 0; i < n; ++i) {
            address member = circle.members[i];
            uint256 allowed = usdc.allowance(member, address(this));
            uint256 balance = usdc.balanceOf(member);

            bool ready;
            if (complete) {
                ready = true;
            } else if (started && member == recipient) {
                ready = true; // the recipient pays nothing this cycle
            } else {
                ready = allowed >= required && balance >= contribution;
            }

            statuses[i] = MemberStatus({
                member: member,
                allowance: allowed,
                balance: balance,
                ready: ready
            });
        }
    }

    /// @notice Circle state. `memberCount` is also the number of cycles.
    function getCircle(
        uint256 circleId
    )
        external
        view
        returns (
            uint256 contribution,
            uint64 period,
            uint64 nextDueAt,
            uint32 cycleIndex,
            bool started,
            uint256 memberCount
        )
    {
        Circle storage circle = _circles[circleId];
        return (
            circle.contribution,
            circle.period,
            circle.nextDueAt,
            circle.cycleIndex,
            circle.started,
            circle.members.length
        );
    }

    /// @notice The payout rotation, in order.
    function getMembers(
        uint256 circleId
    ) external view returns (address[] memory) {
        return _circles[circleId].members;
    }

    /// @notice True once every member has been paid exactly once.
    function isComplete(uint256 circleId) external view returns (bool) {
        Circle storage circle = _circles[circleId];
        uint256 n = circle.members.length;
        return n != 0 && circle.cycleIndex >= n;
    }

    /// @notice The amount each non-recipient pays per cycle.
    function amountDue(uint256 circleId) external view returns (uint256) {
        return _circles[circleId].contribution;
    }

    function _isMember(
        Circle storage circle,
        address account
    ) private view returns (bool) {
        uint256 n = circle.members.length;
        for (uint256 i = 0; i < n; ++i) {
            if (circle.members[i] == account) return true;
        }
        return false;
    }
}
