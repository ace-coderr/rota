// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @notice Test double for Arc's USDC predeploy.
 *
 * @dev Deliberately NOT an OpenZeppelin ERC20. Arc's USDC is Circle's
 * NativeFiatTokenV2_2 behind FiatTokenProxy, which fails in ways OZ v5 does
 * not: it reverts with plain strings, not custom errors, and it carries pause
 * and blocklist machinery. A mock built on OZ would make the suite pass
 * against a token that behaves differently from production.
 *
 * Mirrored from the verified source, guard for guard:
 *
 *   approve       whenNotPaused
 *   transfer      whenNotPaused
 *   transferFrom  whenNotPaused, notBlacklisted(msg.sender)
 *
 * Note which addresses are guarded. V2_2 checks the blocklist only on the
 * *spender* in transferFrom — for Rota, that is the Rota contract itself.
 * from/to are not guarded by a modifier; NativeFiatTokenV2_2._transfer hands
 * the movement to the chain's native coin authority, and a refusal there comes
 * back as "Native transfer failed". `setAuthorityBlocked` models that path.
 */
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowed;
    uint256 public totalSupply;

    bool public paused;
    mapping(address => bool) private _blacklisted;
    /// Models the native coin authority refusing to move an account's balance.
    mapping(address => bool) private _authorityBlocked;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Pause();
    event Unpause();
    event Blacklisted(address indexed _account);
    event UnBlacklisted(address indexed _account);

    modifier whenNotPaused() {
        require(!paused, "Pausable: paused");
        _;
    }

    modifier notBlacklisted(address _account) {
        require(
            !_blacklisted[_account],
            "Blacklistable: account is blacklisted"
        );
        _;
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }

    // --------------------------------------------------------------- views

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256) {
        return _allowed[owner][spender];
    }

    function isBlacklisted(address _account) external view returns (bool) {
        return _blacklisted[_account];
    }

    // ------------------------------------------------------------- erc-20

    function approve(
        address spender,
        uint256 value
    ) external whenNotPaused returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(
        address to,
        uint256 value
    ) external whenNotPaused returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external whenNotPaused notBlacklisted(msg.sender) returns (bool) {
        require(
            value <= _allowed[from][msg.sender],
            "ERC20: transfer amount exceeds allowance"
        );
        _allowed[from][msg.sender] = _allowed[from][msg.sender] - value;
        _transfer(from, to, value);
        return true;
    }

    function _approve(address owner, address spender, uint256 value) private {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        _allowed[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(address from, address to, uint256 value) private {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(
            value <= _balances[from],
            "ERC20: transfer amount exceeds balance"
        );
        // Stands in for NATIVE_COIN_AUTHORITY.transfer, which is where Arc
        // enforces compliance on the sending and receiving accounts.
        require(
            !_authorityBlocked[from] && !_authorityBlocked[to],
            "Native transfer failed"
        );

        _balances[from] = _balances[from] - value;
        _balances[to] = _balances[to] + value;
        emit Transfer(from, to, value);
    }

    // ------------------------------------------------- test-only controls

    function mint(address to, uint256 amount) external {
        _balances[to] = _balances[to] + amount;
        totalSupply = totalSupply + amount;
        emit Transfer(address(0), to, amount);
    }

    function pause() external {
        paused = true;
        emit Pause();
    }

    function unpause() external {
        paused = false;
        emit Unpause();
    }

    function blacklist(address _account) external {
        _blacklisted[_account] = true;
        emit Blacklisted(_account);
    }

    function unBlacklist(address _account) external {
        _blacklisted[_account] = false;
        emit UnBlacklisted(_account);
    }

    /// Makes the simulated native coin authority refuse to move this account.
    function setAuthorityBlocked(address _account, bool blocked) external {
        _authorityBlocked[_account] = blocked;
    }
}
