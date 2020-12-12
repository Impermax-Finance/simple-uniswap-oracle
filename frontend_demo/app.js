let App = {

	pairsShown: [
		'0x1c5DEe94a34D795f9EEeF830B68B80e44868d316', //ETH-DAI
		'0x4E99615101cCBB83A462dC4DE2bc1362EF1365e5', //ETH-UNI
	],
	
	contracts: {},
	render: {},
	
	load: async () => {
		// Load app...
		
		let connected = await App.loadWeb3();
		if( connected == 1 ) {
			$('.connect').append( $('<div class="alert alert-danger mt-3">').text('Account connection denied') );
			return;
		}
		if( connected == 2 ) {
			$('.connect').append( $('<div class="alert alert-danger mt-3">').text('No web3 browser found') );
			return;
		}
		if (ethereum.chainId != 3 ) {
			$('.connect').append( $('<div class="alert alert-danger mt-3">').text('Please connect to the Ropsten network and reload') );
			return;
		}
		$('.connect').hide();
		$('main').show();
		await App.loadAccount();
		await App.loadContract();
		await App.loadCostants();
		await App.render();
	},
	
	loadWeb3: async () => {
		// Modern dapp browsers...
		if (window.ethereum) {
			App.web3Provider = window.ethereum;
			ethereum.autoRefreshOnNetworkChange = false;
			web3 = new Web3(ethereum);
			try {
				// Request account access if needed
				await ethereum.request({ method: 'eth_requestAccounts' }); 
			} catch (error) {
				return 1;
			}
		}
		// Legacy dapp browsers...
		else if (window.web3) {
			App.web3Provider = web3.currentProvider;
			window.web3 = new Web3(web3.currentProvider);
		}
		// Non-dapp browsers...
		else {
			return 2;
		}
		return 0;
	},
	
	loadAccount: async () => {
		App.account = (await ethereum.request({ method: 'eth_accounts' }))[0];
	},
	
	loadContract: async () => {
		const SimpleUniswapOracle = await $.getJSON("/SimpleUniswapOracle.json");
		App.contracts.SimpleUniswapOracle = TruffleContract(SimpleUniswapOracle);
		App.contracts.SimpleUniswapOracle.setProvider(App.web3Provider);
		App.contracts.SimpleUniswapOracle.defaults({from: App.account});
		App.simpleUniswapOracle = await App.contracts.SimpleUniswapOracle.at('0x3c010c718A40838DD2FA83d8C83B24C304F068Cd');
		//App.simpleUniswapOracle = await App.contracts.SimpleUniswapOracle.deployed();
		
		const UniswapV2Pair = await $.getJSON("/IUniswapV2Pair.json");
		App.contracts.UniswapV2Pair = TruffleContract(UniswapV2Pair);
		App.contracts.UniswapV2Pair.setProvider(App.web3Provider);
		
		const ERC20 = await $.getJSON("/IERC20.json");
		App.contracts.ERC20 = TruffleContract(ERC20);
		App.contracts.ERC20.setProvider(App.web3Provider);
	},
	
	loadCostants: async () => {
		App.MIN_T = await App.simpleUniswapOracle.MIN_T();
	},
	
	render: async () => {
		App.refresher.refreshingStart();
		for (address of App.pairsShown) await App.renderPair(address);
		App.refresher.refreshingEnd();
	},
	
	renderPair: async (address) => {
		$('#pairList').find('tbody').append( await App.getPairRow(address) );
	},
	
	refreshRow: async (row) => {
		const newRow = await App.getPairRow(row.data('address'));
		row.replaceWith(newRow);
	},
	
	refreshAll: async () => {
		for (row of $('#pairList').find('tbody').children()) {
			await App.refreshRow($(row));
		}		
	},
	
	getPairRow: async (address) => {
		const row = $('<tr>').data('address', address);
		let result, pair, initializing;
		let totalSupply, reserves;
		let token0Symbol, token0Decimals;
		let token1Symbol, token1Decimals;
		try {	
			pair = await App.simpleUniswapOracle.getPair(address);
		} catch (e) {
			console.log(e);
			return;
			//TODO handle error		
		}
		if (!pair.initialized) {
			console.log("Not initialized! " + address);
			return null;
		}
		try {
			result = await App.simpleUniswapOracle.getResult.call(address);
			initializing = false;
		} catch (e) {
			initializing = true;
		}
		try {
			const uniPair = await App.contracts.UniswapV2Pair.at(address);
			totalSupply = await uniPair.totalSupply();
			reserves = await uniPair.getReserves();
			const token0Address = await uniPair.token0();
			const token1Address = await uniPair.token1();
			const token0 = await App.contracts.ERC20.at(token0Address);
			const token1 = await App.contracts.ERC20.at(token1Address);
			token0Symbol = await token0.symbol();
			token1Symbol = await token1.symbol();
			token0Decimals = await token0.decimals();
			token1Decimals = await token1.decimals();
		} catch (e) {
			console.log(e);
			return;
			//TODO handle error
		}

		const now = Date.now() / 1000;
		const lastUpdateAIsOldEnough = (now - pair.updateA >= App.MIN_T);
		const lastUpdateBIsOldEnough = (now - pair.updateB >= App.MIN_T);

		row.append( $('<td>').text(`${token0Symbol}-${token1Symbol}`) );
		
		if (initializing) row.append( $('<td colspan="3">').text('Initializing...') );
		else {
			//Price math
			const decimalsMultiplier = Math.pow(10, token1Decimals) / Math.pow(10, token0Decimals);
			const price = result.price * decimalsMultiplier / 2**112;
			const currentPrice = reserves.reserve1 / reserves.reserve0;
			const adjustment = Math.sqrt(price / currentPrice);
			const currentLpToken0Price = reserves.reserve0 / totalSupply;
			const currentLpToken1Price = reserves.reserve1 / totalSupply;
			const lpToken0Price = currentLpToken0Price / adjustment * Math.pow(10, token0Decimals) / Math.pow(10, 18);
			const lpToken1Price = currentLpToken1Price * adjustment * Math.pow(10, token1Decimals) / Math.pow(10, 18);
			//Time math
			const T = result.T;
			const lastUpdate = (pair.lastIsA && lastUpdateAIsOldEnough) || (!pair.lastIsA && !lastUpdateBIsOldEnough) 
				? pair.updateA : pair.updateB;
			const d = new Date(lastUpdate*1000);
			const lastUpdateFormatted = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
			row	.append( $('<td>').html(
					`1 ${token0Symbol} = ${price.toPrecision(5)} ${token1Symbol}<br>` + 
					`1 ${token1Symbol} = ${(1/price).toPrecision(5)} ${token0Symbol}<br>` +
					`1 LP Token = ${(lpToken0Price).toPrecision(5)} ${token0Symbol} = ${(lpToken1Price).toPrecision(5)} ${token1Symbol}`
				) )
				.append( $('<td>').text(`${T}`) )
				.append( $('<td>').text(`${lastUpdateFormatted}`) );			
		}

		//Update button
		let updateOnChain;
		if ((pair.lastIsA && !lastUpdateAIsOldEnough) || (!pair.lastIsA && !lastUpdateBIsOldEnough)) {
			updateOnChain = App.makeUpdateOnChainProgressBar(row, pair.lastIsA ? pair.updateA : pair.updateB);
		} else {
			updateOnChain = App.makeUpdateOnChainButton(row);
		}
		row.append( $('<td>').append(updateOnChain) );
		
		return row;
	},
	
	searchByAddress: async (form) => {
		const address = $(form).find("#address").val();
		if (App.pairsShown.includes(address)) {
			console.log("Pair is already shown!"); //TODO error
			return;
		}
		let pair;
		try {
			pair = await App.simpleUniswapOracle.getPair(address);
		} catch (e) {
			console.log(e);
			//TODO handle error
		}
		if (pair.initialized) await App.renderPair(address);
		else await App.initializePairDialog(address);
	},
	
	initializePairDialog: async (address) => {
		const initializeBox = $('<div class="alert alert-info mt-3">');
		initializeBox.append( $('<span>').text('This pair is not initialized yet.') );
		initializeBox.append( $('<button onClick="App.initializePair(this)">').data('address', address)
			.addClass('btn btn-primary ml-3').text('Initialize it now!') );
		initializeBox.append( $('<button onClick="App.initializePairCancel(this)"> class=""')
			.addClass('btn btn-secondary ml-3').text('Cancel') );
		$('main').append(initializeBox);
	},
	
	initializePair: async (button) => {
		const address = $(button).data('address');
		const box = $(button).parent();
		box.find('button').remove();
		box.append($('<button class="btn btn-primary ml-3" type="button" disabled>')
			.append( $('<span class="spinner-border spinner-border-sm mr-2">') )
			.append('Loading...')
		);
		try {
			await App.simpleUniswapOracle.initialize(address);
			await App.renderPair(address);
			App.pairsShown.push(address);
		} catch (e) {
			console.log(e);
		}
		box.remove();
	},
	
	initializePairCancel: async (button) => {
		$(button).parent().remove();
	},
	
	makeUpdateOnChainButton: (row) => {
		const box = $('<div class="text-center">');
		const button = $('<button class="btn btn-sm btn-primary">').text("Update on-chain");

		button.click(async () => {
			button.attr('disabled', true).append( $('<span class="spinner-border spinner-border-sm ml-2">') );
			try {
				await App.simpleUniswapOracle.getResult(row.data('address'));
			} catch (e) {
				//TODO handle error
				console.log(e);
			}
			App.refreshRow(row);
		});
		box.append(button);
		return box;
	},
	
	makeUpdateOnChainProgressBar: (row, lastUpdate) => {
		const box = $('<div class="text-center">');
		const secondsToTime = (seconds) => {
			const m = Math.trunc(seconds / 60);
			const s = seconds % 60;
			return (m >= 10 ? m : '0'+m)+':'+(s >= 10 ? s : '0'+s);
		};
		const secondsCounter = $('<span>');
		const progressBar = $('<div class="progress-bar progress-bar-striped progress-bar-animated ml-0" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%">');
		const updateCountDown = () => {
			const now = Math.round(Date.now() / 1000);
			let current = App.MIN_T - (now - lastUpdate);
			current += 60; //The onchain timestamp seems to be off...
			const percentage = (App.MIN_T - current) / App.MIN_T * 100;
			if (current <= 0) return App.refreshRow(row);			
			secondsCounter.text(secondsToTime(current));
			progressBar.attr('aria-valuenow', percentage).width(percentage+'%');
			setTimeout(updateCountDown, 500);
		};
		box.append(secondsCounter)
		box.append($('<div class="progress">').width('100%').append(progressBar));
		updateCountDown();
		return box;
	},
	
	refresh: async (span) => {
		if (App.refresher.isRefreshing()) return;
		App.refresher.refreshingStart();
		await App.refreshAll();
		App.refresher.refreshingEnd();
	},
	
	refresher: {
		isRefreshing: () => $('#refresh').hasClass('refreshing'),
		refreshingStart: () => $('#refresh').addClass('refreshing').append( $('<span class="spinner-border spinner-border-sm ml-2 text-secondary">') ),
		refreshingEnd: () => $('#refresh').removeClass('refreshing').find('.spinner-border').remove(),
	}
	
}

$(window).on('load', () => {
	App.load();
})
