pragma solidity =0.5.16;

import "../../contracts/SimpleUniswapOracle.sol";

contract SimpleUniswapOracleHarness is SimpleUniswapOracle {

    uint32 internal blockTimestamp;
	bool useBlockTimestampHarness = false;
    
    constructor() public {}
    
    function harnessSetBlockTimestamp(uint32 _blockTimestamp) external {
        blockTimestamp = _blockTimestamp;
		useBlockTimestampHarness = true;
    }
    
	function getBlockTimestamp() public view returns (uint32) {
	    if (useBlockTimestampHarness) return blockTimestamp;
		return super.getBlockTimestamp();
	}
	
	function getPriceCumulativeCurrentHarness(address uniswapV2Pair) external view returns (uint256 priceCumulative) {
		return getPriceCumulativeCurrent(uniswapV2Pair);
	}
}