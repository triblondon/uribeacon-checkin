var noble = require('noble');
var request = require('request');

var senseiurl = process.env.TRIBOT_URL || 'http://sensei.origami.trib.tv';
var location = process.env.LOCATION_DESC || 'Andrew\'s flat';

var uriprefixes = {
	0: 'http://www.',
	1: 'https://www.',
	2: 'http://',
	3: 'https://',
	4: 'urn:uuid:'
}
var expansions = {
	0: '.com/',
	1: '.org/',
	2: '.edu/',
	3: '.net/',
	4: '.info/',
	5: '.biz/',
	6: '.gov/',
	7: '.com',
	8: '.org',
	9: '.edu',
	10: '.net',
	11: '.info',
	12: '.biz',
	13: '.gov'
}

function announce(name) {
	request({
		url: senseiurl+"/rooms/bot-playground",
		method: 'POST',
		headers: {'Content-Type': 'text/plain'},
		body: name + ' has arrived in ' + location
	});
}

noble.on('stateChange', function(state) {
	if (state === 'poweredOn') {
		console.log('Starting scan');
		noble.startScanning(['fed8'], true);
	}
});

noble.on('discover', function(peripheral) {
	var rssi = peripheral.rssi;

	peripheral.advertisement.serviceData.forEach(function(record) {
		if (record.uuid === 'fed8') {
			var b = new Buffer(record.data);
			var flags = b.readUInt8(0);
			var transmitpower = b.readInt8(1);
			var url = uriprefixes[b.readUInt8(2)];
			for (var i=3, s=b.length; i<s; i++) {
				url += b.readUInt8(i) in expansions ? expansions[b.readUInt8(i)] : b.toString('ascii', i, i+1);
			}
			console.log(record.data.toString('ascii'), url, rssi);
		}
	});
});
