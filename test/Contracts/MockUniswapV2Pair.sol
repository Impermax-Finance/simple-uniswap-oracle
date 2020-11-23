pragma solidity ^0.5.16;

import "../../contracts/interfaces/IUniswapV2Pair.sol";
import "../../contracts/libraries/UQ112x112.sol";
import "./MockERC20.sol";
import "./SafeMath.sol";

contract MockUniswapV2Pair is MockERC20 {
	using SafeMath for uint256;
	using UQ112x112 for uint224;
	
	address public token2;
	address public token0;
	address public token1;
	
	constructor (address _token0, address _token1) MockERC20("", "") public {
		blockTimestampLast = uint32(block.timestamp % 2**32);
		token0 = _token0;
		token1 = _token1;
	}
	
	uint112 internal reserve0 = 1e9;
	uint112 internal reserve1 = 1;
	uint32 internal blockTimestampLast;
	uint256 public price0CumulativeLast;
	uint256 public price1CumulativeLast;
	
	function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
		_reserve0 = reserve0;
		_reserve1 = reserve1;
		_blockTimestampLast = blockTimestampLast;
	}
	
	function setPrice(uint32 blockTimestamp, uint224 price) external {
		uint32 timeElapsed = blockTimestamp - blockTimestampLast;
		price0CumulativeLast += uint(UQ112x112.encode(reserve1).uqdiv(reserve0)) * timeElapsed;
		price1CumulativeLast += uint(UQ112x112.encode(reserve0).uqdiv(reserve1)) * timeElapsed;
		reserve1 = toUint112( uint(reserve0).mul(price).div(2**112) );
		blockTimestampLast = blockTimestamp;
	}
	
	function toUint112(uint256 input) internal pure returns(uint112) {
		require(input <= uint112(-1), "MockUniPair: UINT224_OVERFLOW");
		return uint112(input);
	}
	
	function setPriceComulative0Last(uint256 _price0CumulativeLast) external {
		price0CumulativeLast = _price0CumulativeLast;
	}
	
	function setPriceComulative1Last(uint256 _price1CumulativeLast) external {
		price1CumulativeLast = _price1CumulativeLast;
	}
	
	function setReserves(uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) external {
		reserve0 = _reserve0;
		reserve1 = _reserve1;
		blockTimestampLast = _blockTimestampLast;
	}
}