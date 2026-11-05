// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title GameToken — moeda do jogo on-chain (EGG / CORN), 1 token = 1 unidade no jogo.
/// @notice Só o operador (servidor) emite e queima; a queima não exige allowance
///         porque o operador controla as carteiras custodiais (ponte jogo ⇄ chain).
contract GameToken is ERC20, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    error ZeroAddress();

    constructor(string memory name_, string memory symbol_, address operator) ERC20(name_, symbol_) {
        if (operator == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, operator);
        _grantRole(OPERATOR_ROLE, operator);
    }

    /// @dev Sem casas decimais: 1 token = 1 ovo/milho.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Ponte de saída (jogo → chain): emite tokens para a carteira do jogador.
    function mint(address to, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        _mint(to, amount);
    }

    /// @notice Ponte de entrada (chain → jogo): queima tokens da carteira do jogador.
    function burnFrom(address from, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        _burn(from, amount);
    }
}
