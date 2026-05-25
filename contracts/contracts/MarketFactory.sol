// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Market.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MarketFactory is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    address public immutable usdc;
    address public immutable admin;
    uint256 public challengeWindow;
    address[] public markets;
    mapping(bytes32 => bool) public questionExists;
    mapping(address => bool) public isMarket;

    struct AgentProfile {
        string name;
        string specialty;
        bool registered;
        uint256 marketsCreated;
        uint256 totalFeesEarned;
    }

    mapping(address => AgentProfile) public agents;
    address[] public agentList;

    struct Message {
        address from;
        address to;
        string content;
        uint256 timestamp;
        uint256 price;
    }

    Message[] public messages;

    event MarketCreated(address indexed market, address indexed agent, string question, bytes32 questionHash, uint256 expiry);
    event AgentRegistered(address indexed agent, string name, string specialty);
    event MessageSent(address indexed from, address indexed to, uint256 price);

    constructor(address _usdc, uint256 _challengeWindow) {
        usdc = _usdc;
        admin = msg.sender;
        challengeWindow = _challengeWindow;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function registerAgent(
        address agent,
        string calldata name,
        string calldata specialty
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!agents[agent].registered, "ALREADY_REGISTERED");
        agents[agent] = AgentProfile({
            name: name,
            specialty: specialty,
            registered: true,
            marketsCreated: 0,
            totalFeesEarned: 0
        });
        agentList.push(agent);
        _grantRole(AGENT_ROLE, agent);
        emit AgentRegistered(agent, name, specialty);
    }

    function createMarket(
        string calldata question,
        string calldata sourceUrl,
        uint256 expiry
    ) external onlyRole(AGENT_ROLE) returns (address) {
        bytes32 qHash = keccak256(abi.encodePacked(question));
        require(!questionExists[qHash], "DUPLICATE");
        require(expiry > block.timestamp, "EXPIRY_PAST");

        questionExists[qHash] = true;

        Market market = new Market(
            usdc,
            msg.sender,
            admin,
            question,
            qHash,
            sourceUrl,
            expiry,
            challengeWindow
        );

        address marketAddr = address(market);
        markets.push(marketAddr);
        isMarket[marketAddr] = true;
        agents[msg.sender].marketsCreated++;

        emit MarketCreated(marketAddr, msg.sender, question, qHash, expiry);
        return marketAddr;
    }

    function sendMessage(
        address to,
        string calldata content,
        uint256 price
    ) external {
        require(agents[msg.sender].registered, "NOT_AGENT");
        require(agents[to].registered, "RECIPIENT_NOT_AGENT");

        messages.push(Message({
            from: msg.sender,
            to: to,
            content: content,
            timestamp: block.timestamp,
            price: price
        }));

        if (price > 0) {
            IERC20(usdc).safeTransferFrom(msg.sender, to, price);
        }

        emit MessageSent(msg.sender, to, price);
    }

    function getMarketsCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarket(uint256 index) external view returns (address) {
        return markets[index];
    }

    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getAllAgents() external view returns (address[] memory) {
        return agentList;
    }

    function getAgent(address agent) external view returns (AgentProfile memory) {
        return agents[agent];
    }

    function getMessagesCount() external view returns (uint256) {
        return messages.length;
    }

    function getMessages(uint256 from, uint256 count) external view returns (Message[] memory) {
        if (from >= messages.length) return new Message[](0);
        uint256 end = from + count;
        if (end > messages.length) end = messages.length;
        Message[] memory result = new Message[](end - from);
        for (uint256 i = from; i < end; i++) {
            result[i - from] = messages[i];
        }
        return result;
    }
}
