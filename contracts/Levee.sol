// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Levee — a wallet that holds money against a date and refuses to release it early.
contract Levee {
    struct Commitment {
        uint256 amount;
        uint256 unlockDate;
        string label;
        bool released;
    }

    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public committedOf;
    mapping(address => Commitment[]) private _commitments;

    bool private _locked;

    event Deposited(address indexed user, uint256 amount);
    event Committed(address indexed user, uint256 indexed commitmentId, uint256 amount, uint256 unlockDate, string label);
    event Released(address indexed user, uint256 indexed commitmentId, uint256 amount);
    event Spent(address indexed user, address indexed to, uint256 amount);

    error UnlockDateNotInFuture();
    error InsufficientFreeBalance();
    error InvalidCommitment();
    error AlreadyReleased();
    error NotYetUnlocked();
    error ExceedsFreeBalance();
    error TransferFailed();
    error Reentrant();

    modifier nonReentrant() {
        if (_locked) revert Reentrant();
        _locked = true;
        _;
        _locked = false;
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function commit(uint256 amount, uint256 unlockDate, string calldata label) external returns (uint256 commitmentId) {
        if (unlockDate <= block.timestamp) revert UnlockDateNotInFuture();
        if (amount > freeBalance(msg.sender)) revert InsufficientFreeBalance();

        _commitments[msg.sender].push(Commitment({
            amount: amount,
            unlockDate: unlockDate,
            label: label,
            released: false
        }));
        commitmentId = _commitments[msg.sender].length - 1;

        committedOf[msg.sender] += amount;
        emit Committed(msg.sender, commitmentId, amount, unlockDate, label);
    }

    function release(uint256 commitmentId) external {
        if (commitmentId >= _commitments[msg.sender].length) revert InvalidCommitment();
        Commitment storage c = _commitments[msg.sender][commitmentId];
        if (c.released) revert AlreadyReleased();
        if (block.timestamp < c.unlockDate) revert NotYetUnlocked();

        c.released = true;
        committedOf[msg.sender] -= c.amount;
        emit Released(msg.sender, commitmentId, c.amount);
    }

    function spendFree(uint256 amount, address to) external nonReentrant {
        if (amount > freeBalance(msg.sender)) revert ExceedsFreeBalance();

        balanceOf[msg.sender] -= amount;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Spent(msg.sender, to, amount);
    }

    function canSpend(address user, uint256 amount)
        external
        view
        returns (bool allowed, uint256 blockingId, string memory label, uint256 unlockDate)
    {
        if (amount <= freeBalance(user)) {
            return (true, 0, "", 0);
        }

        Commitment[] storage cs = _commitments[user];
        bool found = false;
        uint256 soonest = type(uint256).max;
        uint256 soonestId;

        for (uint256 i = 0; i < cs.length; i++) {
            if (!cs[i].released && cs[i].unlockDate < soonest) {
                soonest = cs[i].unlockDate;
                soonestId = i;
                found = true;
            }
        }

        if (found) {
            return (false, soonestId, cs[soonestId].label, cs[soonestId].unlockDate);
        }
        return (false, 0, "", 0);
    }

    function freeBalance(address user) public view returns (uint256) {
        return balanceOf[user] - committedOf[user];
    }

    function commitmentsOf(address user) external view returns (Commitment[] memory) {
        return _commitments[user];
    }
}
