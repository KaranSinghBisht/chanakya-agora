// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Market.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract MarketFactory is AccessControl {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    address public immutable usdc;
    uint256 public challengeWindow;
    address[] public markets;
    mapping(bytes32 => bool) public questionExists;

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
    event MessageSent(address indexed from, address indexed to, string content, uint256 price);

    constructor(address _usdc, uint256 _challengeWindow) {
        usdc = _usdc;
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
        bytes32 questionHash,
        string calldata sourceUrl,
        uint256 expiry
    ) external onlyRole(AGENT_ROLE) returns (address) {
        require(!questionExists[questionHash], "DUPLICATE");
        require(expiry > block.timestamp, "EXPIRY_PAST");

        questionExists[questionHash] = true;

        Market market = new Market(
            usdc,
            msg.sender,
            question,
            questionHash,
            sourceUrl,
            expiry,
            challengeWindow
        );

        markets.push(address(market));
        agents[msg.sender].marketsCreated++;

        emit MarketCreated(address(market), msg.sender, question, questionHash, expiry);
        return address(market);
    }

    function sendMessage(
        address to,
        string calldata content,
        uint256 price
    ) external {
        require(agents[msg.sender].registered, "NOT_AGENT");
        require(agents[to].registered, "RECIPIENT_NOT_AGENT");

        if (price > 0) {
            IERC20(usdc).transferFrom(msg.sender, to, price);
        }

        messages.push(Message({
            from: msg.sender,
            to: to,
            content: content,
            timestamp: block.timestamp,
            price: price
        }));

        emit MessageSent(msg.sender, to, content, price);
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
        uint256 end = from + count;
        if (end > messages.length) end = messages.length;
        Message[] memory result = new Message[](end - from);
        for (uint256 i = from; i < end; i++) {
            result[i - from] = messages[i];
        }
        return result;
    }
}
