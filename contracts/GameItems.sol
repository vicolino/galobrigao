// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title GameItems — NFTs de acessórios e skins lendárias e de galos.
/// @notice Só o operador (servidor) cunha; metadados servidos em baseURI + tokenId.
contract GameItems is ERC721, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct Item {
        string kind;   // 'acc' | 'skin' | 'galo'
        string itemId; // id do item no jogo
    }

    /// @notice Dados de cada token: items(tokenId) → (kind, itemId).
    mapping(uint256 => Item) public items;
    uint256 public nextTokenId = 1;
    string private _base;

    event Minted(uint256 indexed tokenId, address indexed to, string kind, string itemId);
    event BaseURIChanged(string baseURI);
    event Burned(uint256 indexed tokenId);

    error ZeroAddress();
    error InvalidKind();
    error EmptyItemId();

    constructor(address operator, string memory baseURI_) ERC721("Chicken Fighter Items", "CFI") {
        if (operator == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, operator);
        _grantRole(OPERATOR_ROLE, operator);
        _base = baseURI_;
    }

    /// @notice Cunha um item para `to`. Usa _mint (não safe): destinos são carteiras custodiais.
    function mint(address to, string calldata kind, string calldata itemId)
        external
        onlyRole(OPERATOR_ROLE)
        returns (uint256 tokenId)
    {
        bytes32 k = keccak256(bytes(kind));
        if (k != keccak256("acc") && k != keccak256("skin") && k != keccak256("galo")) revert InvalidKind();
        if (bytes(itemId).length == 0) revert EmptyItemId();
        tokenId = nextTokenId++;
        items[tokenId] = Item(kind, itemId);
        _mint(to, tokenId);
        emit Minted(tokenId, to, kind, itemId);
    }

    /// @notice Ponte de volta para o jogo: o operador queima o token da carteira custodial.
    function burn(uint256 tokenId) external onlyRole(OPERATOR_ROLE) {
        _burn(tokenId);
        delete items[tokenId];
        emit Burned(tokenId);
    }

    function setBaseURI(string calldata baseURI_) external onlyRole(OPERATOR_ROLE) {
        _base = baseURI_;
        emit BaseURIChanged(baseURI_);
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    function supportsInterface(bytes4 id) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(id);
    }
}
