// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Market {
    using SafeERC20 for IERC20;

    enum State { OPEN, PROPOSED, RESOLVED, DISPUTED }

    struct Take {
        address agent;
        bool position;
        uint256 confidence;
        string reasoning;
        uint256 betAmount;
        uint256 timestamp;
    }

    IERC20 public immutable usdc;
    address public immutable factory;
    address public immutable creator;
    address public immutable admin;
    string public question;
    bytes32 public questionHash;
    string public sourceUrl;
    uint256 public expiry;
    uint256 public challengeWindow;

    uint256 public yesPool;
    uint256 public noPool;
    mapping(address => uint256) public yesBets;
    mapping(address => uint256) public noBets;
    mapping(address => bool) public claimed;

    State public state;
    bool public outcome;
    uint256 public proposedAt;
    address public proposedBy;

    Take[] public takes;

    uint256 public constant AGENT_FEE_BPS = 200;

    event BetPlaced(address indexed bettor, bool isYes, uint256 amount, uint256 fee);
    event TakePosted(address indexed agent, bool position, uint256 confidence, string reasoning, uint256 betAmount);
    event ResolutionProposed(address indexed proposer, bool outcome);
    event ResolutionFinalized(bool outcome);
    event Disputed(address indexed disputer);
    event Claimed(address indexed claimer, uint256 payout);

    modifier onlyState(State _state) {
        require(state == _state, "WRONG_STATE");
        _;
    }

    constructor(
        address _usdc,
        address _creator,
        address _admin,
        string memory _question,
        bytes32 _questionHash,
        string memory _sourceUrl,
        uint256 _expiry,
        uint256 _challengeWindow
    ) {
        usdc = IERC20(_usdc);
        factory = msg.sender;
        creator = _creator;
        admin = _admin;
        question = _question;
        questionHash = _questionHash;
        sourceUrl = _sourceUrl;
        expiry = _expiry;
        challengeWindow = _challengeWindow;
        state = State.OPEN;
    }

    function _placeBet(address bettor, bool isYes, uint256 amount) internal {
        require(state == State.OPEN, "WRONG_STATE");
        require(block.timestamp < expiry, "EXPIRED");
        require(amount > 0, "ZERO_AMOUNT");

        usdc.safeTransferFrom(bettor, address(this), amount);

        uint256 fee = (amount * AGENT_FEE_BPS) / 10000;
        uint256 net = amount - fee;
        if (fee > 0) {
            usdc.safeTransfer(creator, fee);
        }

        if (isYes) {
            yesPool += net;
            yesBets[bettor] += net;
        } else {
            noPool += net;
            noBets[bettor] += net;
        }

        emit BetPlaced(bettor, isYes, net, fee);
    }

    function placeBet(bool isYes, uint256 amount) external {
        _placeBet(msg.sender, isYes, amount);
    }

    function postTake(
        bool position,
        uint256 confidence,
        string calldata reasoning,
        uint256 betAmount
    ) external onlyState(State.OPEN) {
        takes.push(Take({
            agent: msg.sender,
            position: position,
            confidence: confidence,
            reasoning: reasoning,
            betAmount: betAmount,
            timestamp: block.timestamp
        }));

        if (betAmount > 0) {
            _placeBet(msg.sender, position, betAmount);
        }

        emit TakePosted(msg.sender, position, confidence, reasoning, betAmount);
    }

    function proposeResolution(bool _outcome) external onlyState(State.OPEN) {
        require(block.timestamp >= expiry, "NOT_EXPIRED");
        require(msg.sender == creator || msg.sender == admin, "NOT_AUTHORIZED");
        outcome = _outcome;
        proposedAt = block.timestamp;
        proposedBy = msg.sender;
        state = State.PROPOSED;
        emit ResolutionProposed(msg.sender, _outcome);
    }

    function finalizeResolution() external onlyState(State.PROPOSED) {
        require(block.timestamp >= proposedAt + challengeWindow, "CHALLENGE_OPEN");
        state = State.RESOLVED;
        emit ResolutionFinalized(outcome);
    }

    function dispute() external onlyState(State.PROPOSED) {
        require(block.timestamp < proposedAt + challengeWindow, "WINDOW_CLOSED");
        require(yesBets[msg.sender] > 0 || noBets[msg.sender] > 0, "NO_STAKE");
        state = State.DISPUTED;
        emit Disputed(msg.sender);
    }

    function adminResolve(bool _outcome) external onlyState(State.DISPUTED) {
        require(msg.sender == admin, "NOT_ADMIN");
        outcome = _outcome;
        state = State.RESOLVED;
        emit ResolutionFinalized(_outcome);
    }

    function claim() external onlyState(State.RESOLVED) {
        require(!claimed[msg.sender], "ALREADY_CLAIMED");
        claimed[msg.sender] = true;

        uint256 totalPool = yesPool + noPool;
        uint256 userBet;
        uint256 winningPool;

        if (outcome) {
            userBet = yesBets[msg.sender];
            winningPool = yesPool;
        } else {
            userBet = noBets[msg.sender];
            winningPool = noPool;
        }

        require(userBet > 0, "NO_WINNING_BET");
        uint256 payout = (userBet * totalPool) / winningPool;
        usdc.safeTransfer(msg.sender, payout);
        emit Claimed(msg.sender, payout);
    }

    function getTakesCount() external view returns (uint256) {
        return takes.length;
    }

    function getTake(uint256 index) external view returns (Take memory) {
        return takes[index];
    }

    function getAllTakes() external view returns (Take[] memory) {
        return takes;
    }

    function getOdds() external view returns (uint256 yesProb, uint256 noProb, uint256 total) {
        total = yesPool + noPool;
        if (total == 0) return (50, 50, 0);
        yesProb = (yesPool * 100) / total;
        noProb = 100 - yesProb;
    }
}
