// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Market — mercado de NFTs do jogo com preço em USDC e custódia (escrow) do NFT.
/// @notice O NFT fica no contrato enquanto listado; na compra a taxa vai ao tesouro e o resto ao vendedor.
contract Market is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 2000; // teto de 20%

    struct Listing {
        address seller;
        uint256 price; // em unidades de USDC (6 casas)
    }

    IERC721 public immutable items;
    IERC20 public immutable usdc;
    address public treasury;
    uint16 public feeBps;

    /// @notice listings(tokenId) → (seller, price); seller == 0 significa não listado.
    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event FeeChanged(uint16 feeBps);
    event TreasuryChanged(address treasury);

    error ZeroAddress();
    error FeeTooHigh();
    error ZeroPrice();
    error NotTokenOwner();
    error NotListed();
    error NotSeller();
    error SelfBuy();

    constructor(address items_, address usdc_, address treasury_, uint16 feeBps_) Ownable(msg.sender) {
        if (items_ == address(0) || usdc_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        items = IERC721(items_);
        usdc = IERC20(usdc_);
        treasury = treasury_;
        feeBps = feeBps_;
    }

    /// @notice Lista um NFT próprio; exige approve/setApprovalForAll prévio para o mercado.
    function list(uint256 tokenId, uint256 price) external nonReentrant {
        if (price == 0) revert ZeroPrice();
        if (items.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        listings[tokenId] = Listing(msg.sender, price);
        emit Listed(tokenId, msg.sender, price);
        // escrow: o NFT passa a ficar no contrato
        items.transferFrom(msg.sender, address(this), tokenId);
    }

    /// @notice Cancela a listagem e devolve o NFT ao vendedor.
    function cancel(uint256 tokenId) external nonReentrant {
        Listing memory l = listings[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.seller != msg.sender) revert NotSeller();
        delete listings[tokenId];
        emit Cancelled(tokenId, l.seller);
        items.transferFrom(address(this), l.seller, tokenId);
    }

    /// @notice Compra: comprador paga `price` em USDC (via transferFrom); taxa ao tesouro, resto ao vendedor.
    function buy(uint256 tokenId) external nonReentrant {
        Listing memory l = listings[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.seller == msg.sender) revert SelfBuy();
        uint256 fee = (l.price * feeBps) / 10_000;
        // efeitos antes das interações (checks-effects-interactions)
        delete listings[tokenId];
        emit Sold(tokenId, l.seller, msg.sender, l.price, fee);
        if (fee > 0) usdc.safeTransferFrom(msg.sender, treasury, fee);
        usdc.safeTransferFrom(msg.sender, l.seller, l.price - fee);
        items.transferFrom(address(this), msg.sender, tokenId);
    }

    function setFee(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeChanged(feeBps_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }
}
