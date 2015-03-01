var noble = require('noble');
var request = require('request-promise');
var bunyan = require('bunyan');
var bunyanLogentries = require('bunyan-logentries');
var moment = require('moment');

var uribeaconUUID = 'fed8';
var location = process.env.LOCATION_DESC || 'Unknown';
var updateInterval = 30 * 60;

// Set up logging.  If a Logentries token has been provided, log to hosted service
var logStreams = [{stream: process.stdout, level: 'trace'}];
if (process.env.LOGENTRIES_TOKEN) {
	logStreams.push({
		stream: bunyanLogentries.createStream({token: process.env.LOGENTRIES_TOKEN}),
		level: 'info',
		type:'raw'
	});
}
var log = bunyan.createLogger({
	name: 'uribeacon-checkin',
	streams: logStreams
});

var beacons = {};


// Expansion strings (spec: https://github.com/google/uribeacon/blob/master/specification/AdvertisingMode.md)
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

noble.on('stateChange', function(state) {
	if (state === 'poweredOn') {
		log.info('Starting scan', {location:location});
		noble.startScanning([uribeaconUUID], true);
	}
});

noble.on('discover', function(peripheral) {
	var rssi = peripheral.rssi;

	log.trace('Discovered peripheral', peripheral);

	peripheral.advertisement.serviceData.forEach(function(record) {
		if (record.uuid === uribeaconUUID) {
			var b = new Buffer(record.data);
			var flags = b.readUInt8(0);
			var transmitpower = b.readInt8(1);
			var beaconurl = uriprefixes[b.readUInt8(2)];
			for (var i=3, s=b.length; i<s; i++) {
				beaconurl += b.readUInt8(i) in expansions ? expansions[b.readUInt8(i)] : b.toString('ascii', i, i+1);
			}

			log.debug('Found URIBeacon', {raw: b, beaconurl: beaconurl, rssi: rssi});

			if (beaconurl in beacons && moment(beacons[beaconurl].lastSeenDate).isAfter(moment().subtract(updateInterval, 's'))) {
				log.debug('Update not yet due', {beaconurl:beaconurl, data:beacons[beaconurl]});
			} else {

				// Follow url until it returns something other than a redirect
				var url = beaconurl;
				request({
					url: url,
					followRedirect: function(r) {
						log.trace('Redirect', {from:url, to:r.headers.location});
						url = r.headers.location;
						return true;
					}
				}).then(function(data) {
					data = JSON.parse(data);
					log.debug("Loaded beacon data", data);
					data.lastSeenLocation = location;
					data.lastSeenDate = (new Date()).toISOString();
					return request({
						url: url,
						method: 'PUT',
						json: true,
						body: data
					}).then(function(resp) {
						if (resp.ok) {
							log.info('Spotted', {name:data.displayName, username:data.userName, location:location, url:url, beaconurl:beaconurl});
							beacons[beaconurl] = data;
						} else {
							throw new Error(resp);
						}
					});
				}).catch(function(e) {
					log.warn(e);
				});
			}
		}
	});
});
