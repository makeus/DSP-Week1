process.chdir(__dirname);

var fs = require('fs');
var Promise = require('bluebird');
var dgram = require('dgram');

/**
 * Helper function to send an UDP message 
 * @param {string} message
 * @param {string} host
 * @param {string|int} port
 * @returns {Promise} promise when message has been sent.
 */
function sendMessage(message, host, port) {
	var message = new Buffer(message);
	var client = Promise.promisifyAll(dgram.createSocket('udp4'));

	return client.sendAsync(message, 0, message.length, port, host).then(function() {
		client.close();
	});
}

/**
 * Lamport object. Handles events.
 * @constructor
 */
function Lamport() {
	this.clock = 1;
	this.rounds = 0;
}

/**
 * Getter for clock
 * @return {integer} clock
 */
Lamport.prototype.getClock = function() {
	return this.clock;
};

/**
 * Handles received message event. 
 * Checks maximum of received and current clock and increases it by one.
 * @param {integer} clock Sender clock value.
 * @param {string} senderId Sender.
 */
Lamport.prototype.receivedMessage = function(clock, senderId) {
	this.clock = Math.max(parseInt(clock), this.clock) + 1;
	console.log('r ' + senderId + ' ' + clock + ' ' + this.clock);
};

/**
 * Handles a local event.
 * Increases current clock with a random amount from 1 to 5.
 * @return {Promise} promise resolved when done.
 */
Lamport.prototype.localEvent = function() {
	this.clock += Math.floor((Math.random() * 5) + 1);
	console.log('l ' + this.clock);
	return Promise.resolve();
};

/**
 * Handles a message sending event.
 * Sends a message with own id and current clock to a random node from given nodes.
 * @param {string[]} nodes
 * @param {string} selfID
 * @return {Promise} promise resolved when done.
 */
Lamport.prototype.messageEvent = function(nodes, selfID) {
	var node = nodes[Math.floor((Math.random() * nodes.length))];
	console.log('s ' + node.id + ' ' + this.clock);
	return sendMessage(selfID + ' ' + this.clock, node.host, node.port);
};

/**
 * Handles running a single event.
 * Chooses randomly an event to run.
 * Given nodes a first reduced to ones not stopped (is still running the algorith). 
 * If none are left, a local event is always run.
 * @param {string[]} nodes
 * @param {string} selfId
 * @return {Promise} promise resolved when done.
 */
Lamport.prototype.event = function(nodes, selfID) {
	var active = nodes.reduce(function(carry, current) {
		if(!current.stopped) {
			carry.push(current);
			return carry;
		}
		return carry;
	}, []);

	if(active.length === 0 || Math.random() < 0.5) {
		return this.localEvent();
	}
	return this.messageEvent(active, selfID);
};

/**
 * Nodes object. Handles parsing of the files and overall node storage/management.
 * @constructor
 * @param {string} filename Filename of the config file.
 * @param {string} id running nodes id
 */ 
function Nodes(filename, id) {
	this.selfID = id;
	this.nodes = fs.readFileSync(filename).toString().split('\n').reduce(function(carry, row) {
		var rowArray = row.split(' ');
		if(rowArray.length == 3) {
			carry.push({
				id: rowArray[0],
				host: rowArray[1],
				port: rowArray[2]
			});
		}
		return carry; 
	}, []);
}

/**
 * Gets all other nodes
 * @return {object[]} nodes
 */
Nodes.prototype.getNodes = function() {
	var nodes = [];
	var $this = this;
	this.nodes.forEach(function(row, i) {
		if(row.id !== $this.selfID) {
			nodes.push(row);
		}
	});
	return nodes;
};

/**
 * @return {string|int}
 */
Nodes.prototype.getSelfPort = function() {
	return this.getId(this.selfID).port;
};

/**
 * Returns a random node
 * @return {object}
 */
Nodes.prototype.getRandom = function() {
	return this.nodes[Math.floor((Math.random() * this.nodes.length))];
};

/**
 * Returns a node for id
 * @param {string} id
 * @return {object} 
 */
Nodes.prototype.getId = function(id) {
	var ret;
	this.nodes.forEach(function(row) {
		if(row.id === id) {
			ret = row;
		}
	});
	return ret;
};

/**
 * Sets given node as received ie. is ready to run the algorithm.
 * @param {string} id
 */
Nodes.prototype.setReceived = function(id) {
	this.getId(id).received = true;
};

/**
 * Sets given node as stopped ie. is done with the algorithm.
 * @param {string} id
 */
Nodes.prototype.setStopped = function(id) {
	this.getId(id).stopped = true;
};

/**
 * Returns wether all nodes are received ie. all are ready to run the algorithm.
 * @return {boolean}
 */
Nodes.prototype.allReceived = function() {
	return this.getNodes().reduce(function(prev, val, i) {
		return prev && val.received;
	}, true);
};

/**
 * Runner object. Handles running the algorithm
 * @constructor
 */
function Runner(nodes, lamport) {
	this.promise;
	this.nodes = nodes;
	this.lamport = lamport;
	this.events = 0;
}

/**
 * Runs the algorithm.
 * @return {Promise} promise to resolve when the algorithm is done.
 */
Runner.prototype.run = function() {
	var $this = this;
	this.promise = this.getRound();
	return this.promise;
};

/**
 * Set a message received event. Increases event amount.
 * @param {integer} clock Clock from the sender.
 * @param {string} senderId
 */
Runner.prototype.messageReceived = function(clock, senderId) {
	this.lamport.receivedMessage(clock, senderId);
	this.events++;
};

/**
 * Recursive function to run the algorithm with events every 200ms.
 * Each round increase the event calculator.
 * Recursion is stopped when a limit of 100 events is reached. 
 * @return {Promise} promise to resolve when event limit is reached.
 */
Runner.prototype.getRound = function() {
	var $this = this;
	return this.lamport.event(this.nodes.getNodes(), this.nodes.selfID).then(function() {
		return Promise.delay(200).then(function() {
			if(++$this.events < 100) {
				return $this.run();	
			}
		});
	});
};


if(process.argv.length < 4) {
	console.error('Invalid amount of arguments!');
	return;
}

/**
 * Parsing parameters and initializing objects.
 */
var filename = process.argv[2];
var id = process.argv[3];
var nodes = new Nodes(filename, id);
var port = nodes.getSelfPort();
var lamport = new Lamport();
var runner = new Runner(nodes, lamport);

if(!port) {
	console.error('No row for file');
	return;
}

/**
 * Starting an UDP server
 */
var server = dgram.createSocket('udp4');

/**
 * Message event listener. 
 * UDP message can be either
 * 	1. a message to indicate that node is ready to start
 * 		1.1 On message, sender is responded with similar message.
 * 	2. a message to indicate that node is done with the algorithm
 * 		2.1 On message node is marked as stopeed.
 * 	3. a message from nodes to with a clock value as part of the algorithm.
 */ 
server.on('message', function (message, sender) {
	var data = message.toString().split(' ');
	if(data.length !== 2) {
		return;
	}
	switch(data[1]) {
		case 'start': {
			if(nodes.getId(data[0]).received) {
				return;
			}
			nodes.setReceived(data[0]);
			sendMessage(id + ' start', nodes.getId(data[0]).host, nodes.getId(data[0]).port);

			if(nodes.allReceived()) {
				runner.run().then(function() {
					sendMessage(id + ' done', nodes.getId(data[0]).host, nodes.getId(data[0]).port).then(function() {
						server.close();
					});
				});
			}
			break;
		}
		case 'done': {
			nodes.setStopped(data[0]);
			break;
		}
		default: {
			runner.messageReceived(data[1], data[0]);
			break;
		}
	}
});

/**
 * Event to run on server start. 
 * Send every node a message to indicate server is ready.
 */ 
server.on('listening', function () {
    var address = server.address();
	var message = id + ' start';
    nodes.getNodes().forEach(function(node) {
    	sendMessage(message, node.host, node.port);
    });
});

server.bind(port);