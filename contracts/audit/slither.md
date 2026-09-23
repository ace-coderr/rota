Summary
 - [arbitrary-send-erc20](#arbitrary-send-erc20) (1 results) (High)
 - [calls-loop](#calls-loop) (3 results) (Low)
 - [timestamp](#timestamp) (1 results) (Low)
 - [assembly](#assembly) (12 results) (Informational)
 - [pragma](#pragma) (1 results) (Informational)
 - [dead-code](#dead-code) (19 results) (Informational)
 - [solc-version](#solc-version) (10 results) (Informational)
## arbitrary-send-erc20
Impact: High
Confidence: High
 - [ ] ID-0
[Rota.disburse(uint256)](contracts/Rota.sol#L232-L281) uses arbitrary from in transferFrom: [usdc.safeTransferFrom(member,recipient,contribution)](contracts/Rota.sol#L276)

contracts/Rota.sol#L232-L281


## calls-loop
Impact: Low
Confidence: Medium
 - [ ] ID-1
[Rota.start(uint256)](contracts/Rota.sol#L197-L221) has external calls inside a loop: [allowed = usdc.allowance(member,address(this))](contracts/Rota.sol#L211)

contracts/Rota.sol#L197-L221


 - [ ] ID-2
[Rota.previewRound(uint256)](contracts/Rota.sol#L294-L346) has external calls inside a loop: [allowed = usdc.allowance(member,address(this))](contracts/Rota.sol#L322)

contracts/Rota.sol#L294-L346


 - [ ] ID-3
[Rota.previewRound(uint256)](contracts/Rota.sol#L294-L346) has external calls inside a loop: [balance = usdc.balanceOf(member)](contracts/Rota.sol#L323)

contracts/Rota.sol#L294-L346


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-4
[Rota.disburse(uint256)](contracts/Rota.sol#L232-L281) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < circle.nextDueAt](contracts/Rota.sol#L240)
	- [block.timestamp >= circle.nextDueAt + circle.period](contracts/Rota.sol#L257)

contracts/Rota.sol#L232-L281


## assembly
Impact: Informational
Confidence: High
 - [ ] ID-5
[StorageSlot.getAddressSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L66-L70) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L67-L69)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L66-L70


 - [ ] ID-6
[SafeERC20._safeTransfer(IERC20,address,uint256,bool)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L176-L200) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L179-L199)

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L176-L200


 - [ ] ID-7
[StorageSlot.getUint256Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L93-L97) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L94-L96)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L93-L97


 - [ ] ID-8
[StorageSlot.getBooleanSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L75-L79) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L76-L78)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L75-L79


 - [ ] ID-9
[StorageSlot.getBytes32Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L84-L88) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L85-L87)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L84-L88


 - [ ] ID-10
[SafeERC20._safeApprove(IERC20,address,uint256,bool)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L255-L279) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L258-L278)

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L255-L279


 - [ ] ID-11
[StorageSlot.getInt256Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L102-L106) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L103-L105)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L102-L106


 - [ ] ID-12
[StorageSlot.getBytesSlot(bytes)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L138-L142) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L139-L141)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L138-L142


 - [ ] ID-13
[StorageSlot.getStringSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L111-L115) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L112-L114)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L111-L115


 - [ ] ID-14
[StorageSlot.getStringSlot(string)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L120-L124) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L121-L123)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L120-L124


 - [ ] ID-15
[StorageSlot.getBytesSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L129-L133) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L130-L132)

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L129-L133


 - [ ] ID-16
[SafeERC20._safeTransferFrom(IERC20,address,address,uint256,bool)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L212-L244) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L221-L243)

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L212-L244


## pragma
Impact: Informational
Confidence: High
 - [ ] ID-17
Different versions of Solidity are used:
	- Version used: ['0.8.24', '>=0.4.16', '>=0.6.2', '^0.8.20']
	- [0.8.24](contracts/Rota.sol#L2)
	- [>=0.4.16](node_modules/@openzeppelin/contracts/interfaces/IERC165.sol#L4)
	- [>=0.4.16](node_modules/@openzeppelin/contracts/interfaces/IERC20.sol#L4)
	- [>=0.4.16](node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L4)
	- [>=0.4.16](node_modules/@openzeppelin/contracts/utils/introspection/IERC165.sol#L4)
	- [>=0.6.2](node_modules/@openzeppelin/contracts/interfaces/IERC1363.sol#L4)
	- [^0.8.20](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L4)
	- [^0.8.20](node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol#L4)
	- [^0.8.20](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L5)

contracts/Rota.sol#L2


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-18
[SafeERC20.approveAndCallRelaxed(IERC1363,address,uint256,bytes)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L159-L165) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L159-L165


 - [ ] ID-19
[SafeERC20.transferFromAndCallRelaxed(IERC1363,address,address,uint256,bytes)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L134-L146) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L134-L146


 - [ ] ID-20
[StorageSlot.getBytesSlot(bytes)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L138-L142) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L138-L142


 - [ ] ID-21
[SafeERC20.trySafeTransfer(IERC20,address,uint256)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L52-L54) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L52-L54


 - [ ] ID-22
[StorageSlot.getStringSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L111-L115) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L111-L115


 - [ ] ID-23
[StorageSlot.getInt256Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L102-L106) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L102-L106


 - [ ] ID-24
[SafeERC20.safeTransfer(IERC20,address,uint256)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L33-L37) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L33-L37


 - [ ] ID-25
[SafeERC20.safeIncreaseAllowance(IERC20,address,uint256)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L72-L75) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L72-L75


 - [ ] ID-26
[SafeERC20.transferAndCallRelaxed(IERC1363,address,uint256,bytes)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L119-L125) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L119-L125


 - [ ] ID-27
[SafeERC20._safeApprove(IERC20,address,uint256,bool)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L255-L279) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L255-L279


 - [ ] ID-28
[SafeERC20.trySafeTransferFrom(IERC20,address,address,uint256)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L59-L61) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L59-L61


 - [ ] ID-29
[StorageSlot.getStringSlot(string)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L120-L124) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L120-L124


 - [ ] ID-30
[SafeERC20.forceApprove(IERC20,address,uint256)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L105-L110) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L105-L110


 - [ ] ID-31
[StorageSlot.getBooleanSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L75-L79) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L75-L79


 - [ ] ID-32
[StorageSlot.getBytes32Slot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L84-L88) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L84-L88


 - [ ] ID-33
[SafeERC20.safeDecreaseAllowance(IERC20,address,uint256)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L86-L94) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L86-L94


 - [ ] ID-34
[SafeERC20._safeTransfer(IERC20,address,uint256,bool)](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L176-L200) is never used and should be removed

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L176-L200


 - [ ] ID-35
[StorageSlot.getAddressSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L66-L70) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L66-L70


 - [ ] ID-36
[StorageSlot.getBytesSlot(bytes32)](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L129-L133) is never used and should be removed

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L129-L133


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-37
Pragma version[^0.8.20](node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L5) necessitates a version too recent to be trusted. Consider deploying with 0.6.12/0.7.6/0.8.16

node_modules/@openzeppelin/contracts/utils/StorageSlot.sol#L5


 - [ ] ID-38
Pragma version[>=0.6.2](node_modules/@openzeppelin/contracts/interfaces/IERC1363.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/interfaces/IERC1363.sol#L4


 - [ ] ID-39
Pragma version[0.8.24](contracts/Rota.sol#L2) necessitates a version too recent to be trusted. Consider deploying with 0.6.12/0.7.6/0.8.16

contracts/Rota.sol#L2


 - [ ] ID-40
Pragma version[>=0.4.16](node_modules/@openzeppelin/contracts/interfaces/IERC20.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/interfaces/IERC20.sol#L4


 - [ ] ID-41
Pragma version[>=0.4.16](node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L4


 - [ ] ID-42
solc-0.8.24 is not recommended for deployment

 - [ ] ID-43
Pragma version[>=0.4.16](node_modules/@openzeppelin/contracts/interfaces/IERC165.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/interfaces/IERC165.sol#L4


 - [ ] ID-44
Pragma version[^0.8.20](node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol#L4) necessitates a version too recent to be trusted. Consider deploying with 0.6.12/0.7.6/0.8.16

node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol#L4


 - [ ] ID-45
Pragma version[^0.8.20](node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L4) necessitates a version too recent to be trusted. Consider deploying with 0.6.12/0.7.6/0.8.16

node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol#L4


 - [ ] ID-46
Pragma version[>=0.4.16](node_modules/@openzeppelin/contracts/utils/introspection/IERC165.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/utils/introspection/IERC165.sol#L4


