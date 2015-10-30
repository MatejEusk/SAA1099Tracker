/*!
 * SAA1099Tracker v1.1.6.
 * Copyright (c) 2012-2015 Martin Borik <mborik@users.sourceforge.net>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom
 * the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
 * OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF
 * OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
//---------------------------------------------------------------------------------------
$(document).ready(function() { window.Tracker = new Tracker('1.1.6') });
//---------------------------------------------------------------------------------------
/** Tracker.file submodule */
/* global atob, btoa, getCompatible, Blob, LZString, Player, pPosition */
//---------------------------------------------------------------------------------------
var STMFile = (function () {
	function STMFile (tracker) {
		var player = tracker.player,
			settings = tracker.settings,
			storageMap = [], storageLastId, storageBytesUsed = 0;

		this.yetSaved = false;
		this.modified = false;
		this.fileName = '';

//- private methods ---------------------------------------------------------------------
//---------------------------------------------------------------------------------------
		function storageSortAndSum () {
			storageBytesUsed = 0;
			storageMap.sort(function (a, b) { b.timeModified - a.timeModified });
			storageMap.forEach(function (obj) { storageBytesUsed += (obj.length + 40) * 2 });
		}

		function updateAll () {
			var bakLine = player.currentLine;

			tracker.onCmdToggleEditMode(tracker.modeEdit);
			tracker.onCmdToggleLoop(player.loopMode);

			$('#scPattern').val(tracker.workingPattern.toString());
			$('#scPosRepeat').val((player.repeatPosition + 1).toString());
			$('#scPosCurrent').val(player.currentPosition.toString());

			tracker.updatePanels();
			player.currentLine = bakLine;
			tracker.updateTracklist();

			$('#scSampleNumber').val(tracker.workingSample.toString(32).toUpperCase());
			$('#scOrnNumber').val(tracker.workingOrnament.toString(16).toUpperCase());
			$('#scOrnTestSample').val(tracker.workingOrnTestSample.toString(32).toUpperCase());
			$('#scSampleTone,#scOrnTone').val(tracker.workingSampleTone.toString()).trigger('change');
			$('#sbSampleScroll').scrollLeft(0);

			tracker.updateSampleEditor(true);
			tracker.smpornedit.updateOrnamentEditor(true);

			$('#main-tabpanel a').eq(tracker.activeTab).tab('show');
		}

// public methods -----------------------------------------------------------------------
//---------------------------------------------------------------------------------------
		/**
		 * This method builds internal database of stored songs in localStorage...
		 */
		this.reloadStorage = function () {
			storageMap.splice(0);
			storageLastId = -1;

			var i, m, id, n, s, dat,
				l = localStorage.length;

			for (i = 0; i < l; i++) {
				if ((m = localStorage.key(i).match(/^(stmf([0-9a-f]{3}))\-nfo/))) {
					n = parseInt(m[2], 16);
					id = m[1];

					s = localStorage.getItem(m[0]);
					dat = localStorage.getItem(id + '-dat');

					if (!dat) {
						console.log('Tracker.file', 'Unable to read data for file in localStorage\n\t%s:"%s"', m[2], s);
						localStorage.removeItem(m[0]);
						continue;
					}

					if (!(m = s.match(/^(.+)\|(\d+?)\|(\d+?)\|(\d\d:\d\d)$/)))
						continue;

					storageLastId = Math.max(storageLastId, n);
					storageMap.push({
						"id": n,
						"storageId": id,
						"fileName": m[1],
						"timeCreated": parseInt(m[2], 10),
						"timeModified": parseInt(m[3], 10),
						"duration": m[4],
						"length": dat.length
					});
				}
			}

			storageSortAndSum();
		};

//---------------------------------------------------------------------------------------
		/**
		 * This method creates JSON format of song data from tracker,
		 * more specifically full snapshot of tracker state.
		 * @param pretty {bool} set if you want pretty-formatted JSON output.
		 */
		this.createJSON = function (pretty) {
			var i, j, k, l, o, s, it, obj, dat;
			var output = {
					'title':     tracker.songTitle,
					'author':    tracker.songAuthor,
					'samples':   [],
					'ornaments': [],
					'patterns':  [],
					'positions': [],
					'repeatPos': player.repeatPosition,

					'current': {
						'sample':     tracker.workingSample,
						'ornament':   tracker.workingOrnament,
						'ornSample':  tracker.workingOrnTestSample,
						'smpornTone': tracker.workingSampleTone,

						'position':   player.currentPosition,
						'pattern':    tracker.workingPattern,

						'line':       player.currentLine,
						'channel':    tracker.modeEditChannel,
						'column':     tracker.modeEditColumn
					},
					'ctrl': {
						'octave':   tracker.ctrlOctave,
						'sample':   tracker.ctrlSample,
						'ornament': tracker.ctrlOrnament,
						'rowStep':  tracker.ctrlRowStep
					},
					'config': {
						'interrupt': settings.audioInterrupt,
						'activeTab': tracker.activeTab,
						'editMode':  tracker.modeEdit,
						'loopMode':  player.loopMode
					},

					'version': '1.2'
				};

			// storing samples going backward and unshifting array...
			for (i = 31; i > 0; i--) {
				it = player.sample[i], dat = it.data;
				obj = {};

				if (it.name)
					obj.name = it.name;

				obj.loop = it.loop;
				obj.end = it.end;

				if (it.releasable)
					obj.rel = it.releasable;

				// only meaningful data will be stored and therefore
				// we going backward from end of sample and unshifting array...
				obj.data = [];
				for (j = 255; j >= 0; j--) {
					o = dat[j];
					k = 0 | o.enable_freq | (o.enable_noise << 1) | (o.noise_value << 2);

					if (!obj.data.length && !k && !o.volume.byte && !o.shift)
						continue;

					s = k.toString(16) + ('0' + o.volume.byte.toString(16)).substr(-2);
					if (o.shift)
						s = s.concat(
							((o.shift < 0) ? '-' : '+'),
							('00' + o.shift.abs().toString(16)).substr(-3)
						);

					obj.data.unshift(s.toUpperCase());
				}

				// for optimize reasons, we are detecting empty items in arrays...
				if (!obj.data.length)
					obj.data = null;
				if (obj.data === null && !obj.loop && !obj.end && !obj.rel && !obj.name)
					obj = null;
				if (!output.samples.length && obj === null)
					continue;

				output.samples.unshift(obj);
			}

			// storing ornaments going backward and unshifting array...
			for (i = 15; i > 0; i--) {
				it = player.ornament[i];
				obj = {};

				if (it.name)
					obj.name = it.name;

				obj.loop = it.loop;
				obj.end = it.end;

				// only meaningful data will be stored and therefore
				// we going backward from end of sample and unshifting array...
				obj.data = [];
				for (j = 255; j >= 0; j--) {
					k = it.data[j];

					if (!obj.data.length && !k)
						continue;

					obj.data.unshift(''.concat(
						((k < 0) ? '-' : '+'),
						('0' + k.abs().toString(10)).substr(-2)
					).toUpperCase());
				}

				// for optimize reasons, we are detecting empty items in arrays...
				if (!obj.data.length)
					obj.data = null;
				if (obj.data === null && !obj.loop && !obj.end && !obj.name)
					obj = null;
				if (!output.ornaments.length && obj === null)
					continue;

				output.ornaments.unshift(obj);
			}

			// storing patterns...
			for (i = 1, l = player.pattern.length; i < l; i++) {
				it = player.pattern[i], dat = it.data;
				obj = { end: it.end };

				// only meaningful data will be stored and therefore
				// we going backward from end of sample and unshifting array...
				obj.data = [];
				for (j = Player.maxPatternLen; j > 0;) {
					o = dat[--j];
					k = o.orn_release ? 33 : o.orn;
					s = o.release ? '--' : ('0' + o.tone.toString(10)).substr(-2);

					if (!obj.data.length && s === '00' && !o.smp && !k && !o.volume.byte && !o.cmd && !o.cmd_data)
						continue;

					obj.data.unshift(s.concat(
						o.smp.toString(32),
						k.toString(36),
						('0' + o.volume.byte.toString(16)).substr(-2),
						o.cmd.toString(16),
						('0' + o.cmd_data.toString(16)).substr(-2)
					).toUpperCase());
				}

				// for optimize reasons, we are detecting empty items in arrays...
				if (!obj.data.length)
					obj.data = null;
				if (obj.data === null && !obj.end)
					obj = null;
				if (!output.patterns.length && obj === null)
					continue;

				output.patterns.push(obj);
			}

			// storing positions, no optimalizations needed...
			for (i = 0, l = player.position.length; i < l; i++) {
				it = player.position[i], dat = it.ch;
				obj = {
					length: it.length,
					speed:  it.speed,
					ch: []
				};

				for (j = 0; j < 6; j++) {
					k = dat[j].pitch;
					s = ('00' + dat[j].pattern.toString(10)).substr(-3);

					if (k)
						s = s.concat(
							((k < 0) ? '-' : '+'),
							('0' + k.abs().toString(10)).substr(-2)
						);

					obj.ch.push(s);
				}

				output.positions.push(obj);
			}

			return pretty ?
				JSON.stringify(output, null, '\t').replace(/\},\n\t+?\{/g, '}, {') :
				JSON.stringify(output);
		};
//---------------------------------------------------------------------------------------
		/**
		 * This method can parse input JSON with song data in both supported formats:
		 * - v1.1 import from previous MIF85Tracker project
		 * - v1.2 current SAA1099Tracker format specification
		 *
		 * @param data {string|object} song data in JSON
		 */
		this.parseJSON = function (data) {
			if (typeof data === 'string') {
				try {
					var json = data;
					data = JSON.parse(json);
				}
				catch (e) { return false }
			}
			if (typeof data !== 'object')
				return false;

			var i, j, k, l, o, s, it, obj, dat,
				count = { smp: 0, orn: 0, pat: 0, pos: 0 },
				oldVer = false;

			// detection of old JSON format v1.1 from previous project MIF85Tracker...
			if (data.version && data.version == '1.1')
				oldVer = true;
			else if (!data.version || (data.version && data.version != '1.2'))
				return false;

			player.clearSong();
			player.clearSamples();
			player.clearOrnaments();

			//~~~ CREDITS ~~~
			tracker.songTitle = data.title || '';
			tracker.songAuthor = data.author || '';

			//~~~ SAMPLES ~~~
			if (data.samples && data.samples.length) {
				if (oldVer) // ignore empty zero sample
					data.samples.shift();

				for (i = 1; i < 32; i++) {
					if (!!(obj = data.samples[i - 1])) {
						it = player.sample[i];
						dat = it.data;

						if (obj.name)
							it.name = obj.name;
						it.loop = obj.loop || 0;
						it.end = obj.end || 0;
						it.releasable = !!obj.rel;

						if (oldVer) {
							// v1.1
							// - whole sample data stored binary in one BASE64 string,
							//   every tick in 3 bytes...

							o = atob(obj.data);
							for (j = 0, k = 0, l = o.length; j < l && k < 32; j += 3, k++) {
								s = (o.charCodeAt(j + 1) & 0xff);

								dat = it.data[k];
								dat.volume.byte  = (o.charCodeAt(j) & 0xff);
								dat.enable_freq  = !!(s & 0x80);
								dat.enable_noise = !!(s & 0x40);
								dat.noise_value  = (s & 0x30) >> 4;

								dat.shift = ((s & 7) << 8) | (o.charCodeAt(j + 2) & 0xff);
								if (!!(s & 8))
									dat.shift *= -1;
							}
						}
						else {
							// v1.2
							// - every tick stored as simple string with hex values...

							for (j = 0, l = Math.min(256, obj.data.length); j < l; j++) {
								dat = it.data[j];

								s = obj.data[j];
								k = parseInt(s[0], 16) || 0;

								dat.enable_freq  = !!(k & 1);
								dat.enable_noise = !!(k & 2);
								dat.noise_value  =  (k >> 2);
								dat.volume.byte  = parseInt(s.substr(1, 2), 16) || 0;

								dat.shift = parseInt(s.substr(3), 16) || 0;
							}
						}

						count.smp++;
					}
				}
			}

			//~~~ ORNAMENTS ~~~
			if (data.ornaments && data.ornaments.length) {
				if (oldVer) // ignore empty zero ornament
					data.ornaments.shift();

				for (i = 1; i < 16; i++) {
					if (!!(obj = data.ornaments[i - 1])) {
						it = player.ornament[i];
						dat = it.data;

						if (obj.name)
							it.name = obj.name;
						it.loop = obj.loop || 0;
						it.end = obj.end || 0;

						if (oldVer) {
							// v1.1
							// - whole ornament data stored binary in one BASE64 string

							o = atob(obj.data);
							for (j = 0, l = Math.min(256, o.length); j < l; j++)
								dat[j] = o.charCodeAt(j);
						}
						else {
							// v1.2
							// - every tick stored as simple string with signed hex value

							o = obj.data;
							for (j = 0, l = Math.min(256, o.length); j < l; j++)
								dat[j] = parseInt(o[j], 16) || 0;
						}

						count.orn++;
					}
				}
			}

			//~~~ PATTERNS ~~~
			if (data.patterns && data.patterns.length) {
				if (oldVer) // ignore empty zero pattern
					data.patterns.shift();

				for (i = 0; i < data.patterns.length; i++) {
					if (!!(obj = data.patterns[i])) {
						it = player.pattern[player.addNewPattern()];

						if (oldVer) {
							// v1.1
							// - whole pattern data stored binary in one BASE64 string,
							//   starts with pattern length, next every line in 5 bytes

							o = atob(obj);
							it.end = (o.charCodeAt(0) & 0xff);

							for (j = 1, k = 0, l = o.length; j < l && k < Player.maxPatternLen; j += 5, k++) {
								dat = it.data[k];

								dat.tone = (o.charCodeAt(j) & 0x7f);
								dat.release = !!(o.charCodeAt(j) & 0x80);
								dat.smp = (o.charCodeAt(j + 1) & 0x1f);
								dat.orn_release = !!(o.charCodeAt(j + 1) & 0x80);
								dat.volume.byte = (o.charCodeAt(j + 2) & 0xff);
								dat.orn = (o.charCodeAt(j + 3) & 0x0f);
								dat.cmd = (o.charCodeAt(j + 3) & 0xf0) >> 4;
								dat.cmd_data = (o.charCodeAt(j + 4) & 0xff);
							}
						}
						else {
							// v1.2
							// - lines encoded into string with values like in tracklist

							it.end = obj.end || 0;

							for (j = 0, l = Math.min(Player.maxPatternLen, obj.data.length); j < l; j++) {
								s = obj.data[j] || '';
								dat = it.data[j];

								k = parseInt(s.substr(0, 2), 10);
								dat.tone = isNaN(k) ? ((dat.release = true) && 0) : k;

								k = parseInt(s[3], 16);
								dat.orn = isNaN(k) ? ((dat.orn_release = true) && 0) : k;

								dat.sample = parseInt(s[2], 32) || 0;
								dat.volume.byte = parseInt(s.substr(4, 2), 16) || 0;
								dat.cmd = parseInt(s[6], 16) || 0;
								dat.cmd_data = parseInt(s.substr(7), 16) || 0;
							}
						}

						count.pat++;
					}
				}
			}

			//~~~ POSITIONS ~~~
			if (data.positions && data.positions.length) {
				for (i = 0; i < data.positions.length; i++) {
					if (!!(obj = data.positions[i])) {
						it = new pPosition(obj.length, obj.speed);

						if (oldVer)
							o = atob(obj.ch);

						for (j = 0, k = 0; j < 6; j++) {
							if (oldVer) {
								it.ch[j].pattern = (o.charCodeAt(k++) & 0xff);
								it.ch[j].pitch = o.charCodeAt(k++);
							}
							else {
								s = obj.ch[j];
								it.ch[j].pattern = parseInt(s.substr(0, 3), 10) || 0;
								it.ch[j].pitch = parseInt(s.substr(3), 10) || 0;
							}
						}

						player.position.push(it);
						player.countPositionFrames(i);

						count.pos++;
					}
				}
			}

			//~~~ CURRENT STATE ~~~
			if (oldVer && typeof data.config === 'object') {
				o = data.config;

				player.repeatPosition        = o.repeatPosition || 0;
				player.currentPosition       = o.currentPosition || 0;
				player.currentLine           = o.currentLine || 0;

				tracker.activeTab            = 0;
				tracker.modeEdit             = false;
				tracker.modeEditColumn       = 0;
				tracker.modeEditChannel      = o.editChannel || 0;

				tracker.ctrlOctave           = o.ctrlOctave || 2;
				tracker.ctrlSample           = o.ctrlSample || 0;
				tracker.ctrlOrnament         = o.ctrlOrnament || 0;
				tracker.ctrlRowStep          = o.ctrlRowStep || 0;

				settings.audioInterrupt      = o.audioInterrupt || 50;
			}
			else if (typeof data.current === 'object') {
				o = data.current;

				player.repeatPosition        = data.repeatPos || 0;
				player.currentPosition       = o.position || 0;
				player.currentLine           = o.line || 0;

				tracker.workingPattern       = o.pattern || 0;
				tracker.workingSample        = o.sample || 1;
				tracker.workingOrnament      = o.ornament || 1;
				tracker.workingOrnTestSample = o.ornSample || 1;
				tracker.workingSampleTone    = o.smpornTone || 37;
				tracker.modeEditChannel      = o.channel || 0;
				tracker.modeEditColumn       = o.column || 0;

				o = $.extend({}, data.ctrl, data.config);

				player.loopMode              = o.loopMode || true;

				tracker.ctrlOctave           = o.octave || 2;
				tracker.ctrlSample           = o.sample || 0;
				tracker.ctrlOrnament         = o.ornament || 0;
				tracker.ctrlRowStep          = o.rowStep || 0;
				tracker.activeTab            = o.activeTab || 0;
				tracker.modeEdit             = o.editMode || false;

				settings.audioInterrupt      = o.interrupt || 50;
			}

			console.log('Tracker.file', 'JSON file successfully parsed and loaded... %o', {
				title: data.title,
				author: data.author,
				samples: count.smp,
				ornaments: count.orn,
				patterns: count.pat,
				positions: count.pos,
				version: data.version
			});

			updateAll();
			return true;
		};
//---------------------------------------------------------------------------------------
		this.new = function () {
			player.clearSong();
			player.clearSamples();
			player.clearOrnaments();

			tracker.songTitle = '';
			tracker.songAuthor = '';

			player.currentPosition = 0;
			player.repeatPosition = 0;
			player.currentLine = 0;

			tracker.modeEdit = false;
			tracker.modeEditChannel = 0;
			tracker.modeEditColumn = 0;
			tracker.workingPattern = 0;

			this.modified = false;
			this.yetSaved = false;
			this.fileName = '';

			updateAll();
		};
//---------------------------------------------------------------------------------------
		this.loadDemosong = function (fileName) {
			var file = this;

			console.log('Tracker.file', 'Loading "%s" demosong...', fileName);
			$.getJSON('demosongs/' + fileName + '.json', function (data) {
				file.parseJSON(data);
				file.modified = false;
				file.yetSaved = false;
				file.fileName = '';
			});
		};
//---------------------------------------------------------------------------------------
		this.loadFile = function (fileNameOrId) {
			var i, l = storageMap.length, name, obj, data;

			if (typeof fileNameOrId === 'string')
				name = fileNameOrId.replace(/[\.\\\/\":*?%<>|\0-\37]+/g, '').trim();

			for (i = 0; i < l; i++) {
				obj = storageMap[i];

				if (name && obj.fileName === name)
					break;
				else if (!name && typeof fileNameOrId === 'number' && obj.id === fileNameOrId) {
					name = obj.fileName;
					break;
				}
			}

			if (i === l) {
				console.log('Tracker.file', 'File "' + fileNameOrId + '" not found!');
				return false;
			}

			console.log('Tracker.file', 'Loading "%s" from localStorage...', name);
			data = localStorage.getItem(obj.storageId + '-dat');
			console.log('Tracker.file', 'Compressed JSON file format loaded, size: ' + data.length * 2);
			data = LZString.decompressFromUTF16(data);
			console.log('Tracker.file', 'After LZW decompression has %d bytes, parsing...', data.length);

			if (!this.parseJSON(data)) {
				console.log('Tracker.file', 'JSON file parsing failed!');
				return false;
			}

			data = null;
			this.modified = false;
			this.yetSaved = true;
			this.fileName = name;
			return true;
		};
//---------------------------------------------------------------------------------------
		this.saveFile = function (fileName, duration, oldId) {
			var i, l = storageMap.length,
				now = ~~(Date.now() / 1000),
				mod = false, obj, data;

			fileName = fileName.replace(/[\.\\\/\":*?%<>|\0-\37]+/g, '');
			console.log('Tracker.file', 'Storing "%s" to localStorage...', fileName);

			for (i = 0; i < l; i++) {
				obj = storageMap[i];
				if (obj.id === oldId || obj.fileName === fileName) {
					console.log('Tracker.file', 'File ID:%s exists, will be overwritten...', obj.storageId);
					mod = true;
					break;
				}
			}

			if (oldId !== void 0 && !mod) {
				console.log('Tracker.file', 'Cannot find given storageId: %d!', oldId);
				return false;
			}

			data = this.createJSON();
			console.log('Tracker.file', 'JSON file format built, original size: ' + data.length);
			data = LZString.compressToUTF16(data);
			console.log('Tracker.file', 'Compressed with LZW to ' + data.length * 2);

			if (mod) {
				obj = storageMap[i];

				obj.fileName = fileName;
				obj.timeModified = now;
				obj.duration = duration;
				obj.length = data.length;
			}
			else obj = {
				"id": ++storageLastId,
				"storageId": 'stmf' + ('00' + storageLastId.toString(16)).substr(-3),
				"fileName": fileName,
				"timeCreated": now,
				"timeModified": now,
				"duration": duration,
				"length": data.length
			};

			localStorage.setItem(obj.storageId + '-nfo', fileName.concat(
				'|', obj.timeCreated.toString(),
				'|', obj.timeModified.toString(),
				'|', obj.duration
			));

			localStorage.setItem(obj.storageId + '-dat', data);
			data = null;

			if (!mod)
				storageMap.push(obj);
			storageSortAndSum();

			this.yetSaved = true;
			this.modified = false;
			this.fileName = obj.fileName;

			console.log('Tracker.file', 'Everything stored into localStorage...');
			return true;
		};

//---------------------------------------------------------------------------------------
		this.dialog = function (mode) {
			var dlg = $('#filedialog'),
				file = this,
				fn = this.fileName || tracker.songTitle || 'Untitled',
				saveFlag = (mode === 'save'),
				titles = {
					load: 'Open file from storage',
					save: 'Save file to storage'
				};

			if (!titles[mode] || (!saveFlag && !storageMap.length))
				return false;

			dlg.on('show.bs.modal', function () {
				var percent = Math.ceil(100 / ((2 * 1024 * 1024) / storageBytesUsed)),
					selectedItem = null,
					defaultHandler = function () {
						if (saveFlag) {
							var fileName = dlg.find('.file-name>input').val(),
								duration = $('#stInfoPanel u:eq(3)').text();

							file.saveFile(fileName, duration, (selectedItem && selectedItem.id) || undefined);
						}
						else {
							if (!selectedItem)
								return false;
							file.loadFile(selectedItem.id);
						}

						dlg.modal('hide');
						return true;
					},
					itemClickHandler = function (e) {
						e.stopPropagation();
						selectedItem = (e.data && typeof e.data.id === 'number') ? storageMap[e.data.id] : null;

						dlg.find('.file-list>button').removeClass('selected');

						if (selectedItem)
							$(this).addClass('selected');
						if (saveFlag) {
							if (selectedItem)
								dlg.find('.file-name>input').val(selectedItem.fileName);
							dlg.find('.file-remove').prop('disabled', !selectedItem);
						}

						return true;
					};

				dlg.addClass(mode)
					.before($('<div/>').addClass('modal-backdrop in').css('z-index', '1030'));

				dlg.find('.modal-title').text(titles[mode] + '\u2026');
				dlg.find('.file-name>input').val(fn);
				dlg.find('.storage-usage i').text(storageBytesUsed + ' bytes used');
				dlg.find('.storage-usage .progress-bar').css('width', percent + '%');
				dlg.find('.btn-success').on('click', defaultHandler);

				var i, l = storageMap.length, obj, d,
					el = dlg.find('.file-list').empty(),
					span = $('<span/>'),
					cell = $('<button class="cell"/>');

				for (i = 0; i < l; i++) {
					obj = storageMap[i];
					d = (new Date(obj.timeModified * 1000))
							.toISOString().replace(/^([\d\-]+)T([\d:]+).+$/, '$1 $2');

					cell.clone()
						.append(span.clone().addClass('filename').text(obj.fileName))
						.append(span.clone().addClass('fileinfo').text(d + ' | duration: ' + obj.duration))
						.prop('tabindex', i + 1)
						.appendTo(el)
						.on('click focus', { id: i }, itemClickHandler)
						.on('dblclick', defaultHandler);
				}

				dlg.find('.file-open,.file-save').on('click', defaultHandler);

				if (saveFlag) {
					dlg.find('.file-list').on('click', itemClickHandler);
					dlg.find('.file-remove').on('click', function(e) {
					    e.stopPropagation();
					    if (!selectedItem)
					    	return false;

					    $('#dialoque').confirm({
							title: 'Remove file\u2026',
							text: 'Do you really want to remove this file from storage?',
							buttons: 'yesno',
							style: 'danger',
							callback: function (btn) {
								if (btn !== 'yes')
									return;
								for (var i = 0, l = storageMap.length; i < l; i++) {
									if (storageMap[i].storageId === selectedItem.storageId) {
										storageMap.splice(i, 1);
										localStorage.removeItem(selectedItem.storageId + '-nfo');
										localStorage.removeItem(selectedItem.storageId + '-dat');

										itemClickHandler(e);
										dlg.modal('hide');
										file.dialog(mode);
										return;
									}
								}
							}
					    });

					    return true;
					});

					dlg.find('.file-download').on('click', function(e) {
					    e.stopPropagation();

						console.log('Tracker.file', 'Preparing file output to Blob...');

						var el = $(this),
							data = file.createJSON(true),
							mime = 'text/x-saa1099tracker',
							blob, url;

						try {
							blob = new Blob([ data ], {
								type: mime,
								endings: 'native'
							});
						}
						catch (ex) {
							console.log('Tracker.file', 'Blob feature missing [%o], fallback to BlobBuilder...', ex);

							try {
								var bb = getCompatible(window, 'BlobBuilder', true);
								bb.append(data);
								blob = bb.getBlob(mime);
							}
							catch (ex2) {
								console.log('Tracker.file', 'BlobBuilder feature missing [%o], fallback to BASE64 output...', ex2);

								blob = undefined;
								url = 'data:' + mime + ';base64,' + btoa(data);
							}
						}

						if (blob) try {
							url = getCompatible(window, 'URL').createObjectURL(blob) + '';
						}
						catch (ex) {
							console.log('Tracker.file', 'URL feature for Blob missing [%o], fallback to BASE64 output...', ex);
							url = 'data:' + mime + ';base64,' + btoa(data);
						}

						el.attr({
							'href': url,
							'download': file.fileName + '.STMF.json'
						});

						data = null;
						url = null;

						dlg.modal('hide');
						setTimeout(function () { el.attr({ href: '', download: '' }) }, 50);

					    return true;
					});
				}

			}).on('shown.bs.modal', function() {
				dlg.find(saveFlag
					? '.file-name>input'
					: '.file-list>button:first-child').focus();

			}).on('hide.bs.modal', function() {
				dlg.removeClass(mode).prev('.modal-backdrop').remove();
				dlg.off().find('.file-list').off().empty();
				dlg.find('.modal-footer>.btn').off();

			}).modal({
				show: true,
				backdrop: false
			});
		};
//---------------------------------------------------------------------------------------

		this.reloadStorage();
	}

	return STMFile;
})();
//---------------------------------------------------------------------------------------
/** Tracker.tracklist submodule */
//---------------------------------------------------------------------------------------
var TracklistPosition = (function () {
	function TracklistPosition(y, line, channel, column, sx, sy) {
		this.y = y || 0;
		this.line = line || 0;
		this.channel = channel || 0;
		this.column = column || 0;
		this.start = { x: (sx || 0), y: (sy || 0) };

		this.set = function(p) {
			if (!(p instanceof TracklistPosition))
				throw 'invalid object type';

			this.y = p.y;
			this.line = p.line;
			this.channel = p.channel;
			this.column = p.column;
			this.start.x = p.start.x;
			this.start.y = p.start.y;
		};

		this.compare = function (p) {
			if (p instanceof TracklistPosition)
				return (this.y === p.y &&
				        this.line === p.line &&
				        this.channel === p.channel &&
				        this.column === p.column);
		};

	}

	return TracklistPosition;
})();
//---------------------------------------------------------------------------------------
var Tracklist = (function () {
	function Tracklist(app) {
		this.initialized = false;

		this.obj = null;
		this.ctx = null;
		this.zoom = 2;

		// fontWidth = 6 : default width of pixelfont
		this.canvasData = {
			// offsets to column positions in channel data premultiplied by fontWidth:
			//         0   4567 9AB
			//        "A-4 ABFF C01"
			columns: [ 0, 24, 30, 36, 42, 54, 60, 66 ],

			// selection width: (12 columns + 1 padding) * fontWidth
			selWidth : (12 + 1) * 6,

			// channel width: (12 columns + 2 padding) * fontWidth
			chnWidth : (12 + 2) * 6,

			// trackline width:
			// (((12 columns + 2 padding) * 6 channels) + 2 tracknum.columns) * fontWidth
			lineWidth: (((12 + 2) * 6) + 2) * 6,

			// horizontal centering of trackline to canvas width
			center   : 0,

			// trackline data offset: center + (2 tracknums + 2 padding) * fontWidth
			trkOffset: 0,

			// vertical padding of pixelfont in trackline height
			vpad     : 0,

			// jQuery offset object
			offset   : null
		};

		// calculated absolute positions of X:channels/columns and Y:tracklines in canvas
		this.offsets = {
			// 6 channels of 8 column (+1 padding) positions
			x: [ new Array(9), new Array(9), new Array(9), new Array(9), new Array(9), new Array(9) ],
			y: []
		};

		this.selection = {
			isDragging: false,
			start: new TracklistPosition,
			len: 0,
			line: 0,
			channel: 0
		};
//---------------------------------------------------------------------------------------
		this.countTracklines = function() {
			var s = $('#statusbar').offset(),
				t = $('#tracklist').offset(),
				h = app.settings.tracklistLineHeight;
			return Math.max(((((s.top - t.top) / h / this.zoom) | 1) - 2), 5);
		};

		this.setHeight = function(height) {
			var sett = app.settings;

			if (height === void 0) {
				height = sett.tracklistAutosize
					? this.countTracklines()
					: sett.tracklistLines;
			}

			console.log('Tracker.tracklist', 'Computed %d tracklines...', height);

			sett.tracklistLines = height;
			height *= sett.tracklistLineHeight;

			$(this.obj).prop('height', height).css({ 'height': height * this.zoom });
			this.canvasData.offset = $(this.obj).offset();
		};

		this.moveCurrentline = function(delta, noWrap) {
			var player = app.player,
				line = player.currentLine + delta,
				pos = player.currentPosition,
				pp = player.position[pos];

			if (app.modePlay || pp === void 0)
				return;

			if (noWrap)
				line = Math.min(Math.max(line, 0), pp.length - 1);
			else if (line < 0)
				line += pp.length;
			else if (line >= pp.length)
				line -= pp.length;

			player.currentLine = line;
		};

		this.pointToTracklist = function(x, y) {
			var i, j, chl,
				lines = app.settings.tracklistLines,
				tx = x / this.zoom, ty = y / this.zoom,
				half = lines >> 1,
				ln = app.player.currentLine - half;

			for (i = 0; i < lines; i++, ln++) {
				if (ty >= this.offsets.y[i] && ty <= this.offsets.y[i + 1]) {
					for (chl = 0; chl < 6; chl++) {
						if (tx >= this.offsets.x[chl][0] && tx <= this.offsets.x[chl][8]) {
							for (j = 0; j < 8; j++) {
								if (tx >= this.offsets.x[chl][j] && tx <= this.offsets.x[chl][j + 1])
									return new TracklistPosition(i, Math.max(ln, 0), chl, j, x, y);
							}
						}
					}
				}
			}
		};
	}

	return Tracklist;
})();
//---------------------------------------------------------------------------------------
/** Tracker.smporn submodule */
//---------------------------------------------------------------------------------------
var SmpOrnEditor = (function () {
	function SmpOrnEditor(app) {
		this.initialized = false;

		this.img = null;
		this.amp = { obj: null, ctx: null };
		this.noise = { obj: null, ctx: null };
		this.range = { obj: null, ctx: null };

		this.smpeditOffset = null;
		this.smpeditScroll = 0;
		this.columnWidth = 0;
		this.halfing = 0;
		this.centering = 0;
		this.radix = 10;

		this.drag = {
			isDragging: false,
			freqEnableState: false,
			rangeStart: -1
		};
//---------------------------------------------------------------------------------------
		this.init = function() {
			var parts = [ 'amp', 'noise', 'range' ],
				i, l, o, ctx, w, h, half;

			console.log('Tracker.smporn', 'Initial drawing of Sample editor canvases...');
			for (i = 0, l = parts.length; i < l; i++) {
				o = this[parts[i]];

				ctx = o.ctx;
				w = o.obj.width;
				h = o.obj.height;
				half = h >> 1;

				ctx.miterLimit = 0;
				ctx.fillStyle = '#fcfcfc';
				ctx.fillRect(0, 0, 22, h);
				ctx.fillStyle = '#ccc';
				ctx.fillRect(22, 0, 1, h);

				if (i === 0) {
					this.halfing = (half -= 12);
					this.columnWidth = ((w - 26) / 64) | 0;
					this.centering = 26 + (w - (this.columnWidth * 64)) >> 1;

					ctx.fillRect(22, half, w - 22, 1);
					ctx.fillRect(22, 286, w - 22, 1);

					ctx.save();
					ctx.font = $('label').first().css('font');
					ctx.translate(12, half);
					ctx.rotate(-Math.PI / 2);
					ctx.textBaseline = "middle";
					ctx.fillStyle = '#888';
					ctx.textAlign = "right";
					ctx.fillText("RIGHT", -16, 0);
					ctx.textAlign = "left";
					ctx.fillText("LEFT", 16, 0);
					ctx.restore();
				}

				ctx.drawImage(this.img, i * 16, 0, 16, 16, 4, half - 8, 16, 16);
			}

			this.updateOffsets();
			this.createPitchShiftTable();
			this.createOrnamentEditorTable();

			app.updateSampleEditor(true);
			this.initialized = true;

			console.log('Tracker.smporn', 'Sample/Ornament editors completely initialized...');
		};

		this.updateOffsets = function () {
			var amp = $(this.amp.obj).offset(),
				noise = $(this.noise.obj).offset();

			this.smpeditOffset = {
				left: 0 | amp.left,
				top: {
					amp: 0 | amp.top,
					noise: 0| noise.top
				}
			};

			console.log('Tracker.smporn', 'Sample editor canvas offsets observed...\n\t\t%c%s',
				'color:gray', JSON.stringify(this.smpeditOffset, null, 1).replace(/\s+/g, ' '));
		};

		this.updateSamplePitchShift = function () {
			var sample = app.player.sample[app.workingSample],
				noloop = (sample.end === sample.loop),
				data;

			$('#fxSampleShift>.cell').each(function (i, el) {
				data = sample.data[i];

				if (i >= sample.end && !sample.releasable)
					el.className = 'cell';
				else if (!noloop && i >= sample.loop && i < sample.end)
					el.className = 'cell loop';
				else
					el.className = 'cell on';

				$(el).find('input').val(parseInt(data.shift, this.radix));
			});

			$('#fxSampleShift').parent().scrollLeft(0);
		};

		this.createPitchShiftTable = function () {
			var i, s,
				el = $('#fxSampleShift').empty(),
				cell = $('<div class="cell"/>'),
				spin = $('<input type="text" class="form-control">');

			console.log('Tracker.smporn', 'Creating elements into Pitch-shift tab...');
			for (i = 0; i < 256; i++) {
				s = spin.clone();
				cell.clone().append(s).appendTo(el);

				s.TouchSpin({
					prefix:  i.toWidth(3),
					radix: (this.radix = app.settings.hexSampleFreq ? 16 : 10),
					initval: 0, min: -1023, max: 1023
				})
				.change({ index: i }, function(e) {
					var radix = app.settings.hexSampleFreq ? 16 : 10,
						sample = app.player.sample[app.workingSample],
						data = sample.data,
						el = e.target;

					data[e.data.index].shift = parseInt(el.value, radix);
				})
				.prop('tabindex', i + 1);
			}
		};
//---------------------------------------------------------------------------------------
		this.chords = {
			'maj':    { sequence: [ 0, 4, 7 ],     name: 'major' },
			'min':    { sequence: [ 0, 3, 7 ],     name: 'minor' },
			'maj7':   { sequence: [ 0, 4, 7, 11 ], name: 'major 7th' },
			'min7':   { sequence: [ 0, 3, 7, 10 ], name: 'minor 7th' },
			'sus2':   { sequence: [ 0, 2, 7 ],     name: 'suspended 2nd' },
			'sus4':   { sequence: [ 0, 5, 7 ],     name: 'suspended 4th' },
			'6':      { sequence: [ 0, 4, 7, 9 ],  name: 'major 6th' },
			'7':      { sequence: [ 0, 4, 7, 10 ], name: 'dominant 7th' },
			'add9':   { sequence: [ 0, 2, 4, 7 ],  name: 'added 9th' },
			'min7b5': { sequence: [ 0, 3, 6, 12 ], name: 'minor 7th with flatted 5th' },
			'aug':    { sequence: [ 0, 4, 10 ],    name: 'augmented' },
			'dim':    { sequence: [ 0, 3, 6, 9 ],  name: 'diminished' },
			'12th':   { sequence: [ 12, 0 ],       name: '12th' }
		};

		this.updateOrnamentEditor = function (update) {
			var orn = app.player.ornament[app.workingOrnament],
				noloop = (orn.end === orn.loop);

			$('#fxOrnEditor>.cell').each(function (i, el) {
				if (i >= orn.end)
					el.className = 'cell';
				else if (!noloop && i >= orn.loop && i < orn.end)
					el.className = 'cell loop';
				else
					el.className = 'cell on';

				$(el).find('input').val(orn.data[i]);
			});

			if (update) {
				$('#txOrnName').val(orn.name);
				$('#fxOrnEditor').parent().scrollLeft(0);

				$('#scOrnLength').val('' + orn.end);
				$('#scOrnRepeat')
					.trigger('touchspin.updatesettings', { min: 0, max: orn.end })
					.val(orn.end - orn.loop);
			}
		};

		this.createOrnamentEditorTable = function () {
			var i, s,
				el = $('#fxOrnEditor').empty(),
				cell = $('<div class="cell"/>'),
				spin = $('<input type="text" class="form-control">');

			console.log('Tracker.smporn', 'Creating elements into Ornament editor...');
			for (i = 0; i < 256; i++) {
				s = spin.clone();
				cell.clone().append(s).appendTo(el);

				s.TouchSpin({
					prefix:  i.toWidth(3),
					initval: 0, min: -60, max: 60
				})
				.change({ index: i }, function(e) {
					var orn = app.player.ornament[app.workingOrnament],
						el = e.target;

					orn.data[e.data.index] = parseInt(el.value, 10);
				})
				.prop('tabindex', i + 1);
			}
		};
	}

	return SmpOrnEditor;
})();
//---------------------------------------------------------------------------------------
/** Tracker.core submodule */
/* global browser, STMFile, AudioDriver, SAASound, SyncTimer, Player, Tracklist, SmpOrnEditor */
//---------------------------------------------------------------------------------------
var Tracker = (function() {
	function Tracker(ver) {
		console.log('Tracker', 'Inizializing SAA1099Tracker v%s...', ver);

		this.version = ver;

		this.loaded = false;
		this.activeTab = null;

		this.modePlay = false;
		this.modeEdit = false;
		this.modeEditChannel = 0;
		this.modeEditColumn = 0;
		this.workingPattern = 0;
		this.workingSample = 1;
		this.workingSampleTone = 37;
		this.workingOrnament = 1;
		this.workingOrnTestSample = 1;

		this.ctrlOctave = 2;
		this.ctrlSample = 0;
		this.ctrlOrnament = 0;
		this.ctrlRowStep = 0;

		this.songTitle = '';
		this.songAuthor = '';

		this.globalKeyState = {
			modsHandled: false,
			lastPlayMode: 0,
			length: 0
		};

		this.settings = {
			tracklistAutosize: true,
			tracklistLines: 17,
			tracklistLineHeight: 9,
			hexTracklines: true,
			hexSampleFreq: false,
			audioInterrupt: 50,
			audioBuffers: 0
		};

		this.pixelfont  = { obj: null, ctx: null };
		this.tracklist  = new Tracklist(this);
		this.smpornedit = new SmpOrnEditor(this);


	// constructor {
		if (AudioDriver) {
			this.player = new Player(new SAASound(AudioDriver.sampleRate));
			AudioDriver.init(this.player);
		}
		else
			$('#overlay>span').html(
				browser.isIE ?
					"don't be evil,<br>stop using IE" :
					"WebAudio<br>not supported"
			);

		if (this.player) {
			this.file = new STMFile(this);

			this.populateGUI();
			this.initializeGUI();
		}
	// }
	}

	Tracker.prototype.baseTimer = function() {
		if (this.modePlay && this.player.changedLine) {
			if (this.player.changedPosition)
				this.updatePanelPosition();
			this.updatePanelInfo();
			this.updateTracklist();

			this.player.changedPosition = false;
			this.player.changedLine = false;
		}
	};

	return Tracker;
})();
//---------------------------------------------------------------------------------------
/** Tracker.controls submodule */
//---------------------------------------------------------------------------------------
Tracker.prototype.updatePanels = function () {
	$('#scOctave').val(this.ctrlOctave);
	$('#scAutoSmp').val(this.ctrlSample);
	$('#scAutoOrn').val(this.ctrlOrnament);
	$('#scRowStep').val(this.ctrlRowStep);

	$('#txHeaderTitle').val(this.songTitle);
	$('#txHeaderAuthor').val(this.songAuthor);

	this.updatePanelInfo();
	this.updatePanelPattern();
	this.updatePanelPosition();
};
//---------------------------------------------------------------------------------------
Tracker.prototype.updateEditorCombo = function (step) {
	if (step === void 0) {
		this.player.playLine();
		step = this.ctrlRowStep;
	}

	this.tracklist.moveCurrentline(step);
	this.updateTracklist();
	this.updatePanelInfo();
};
//---------------------------------------------------------------------------------------
Tracker.prototype.updatePanelInfo = function () {
	var p = this.player,
		el = $('#stInfoPanel u'),
		int = this.settings.audioInterrupt,
		total = 0, current = 0,
		curpos = p.currentPosition,
		len = p.position.length,
		pos = p.position[curpos],
		posi = null,
		line = p.currentLine,
		even = line & -2,
		bpm, i = int * 60;

	if (len) {
		bpm = (i / (pos.frames[even + 2] - pos.frames[even])) >> 1;

		for (i = 0; i < len; i++) {
			posi = p.position[i];
			if (i === curpos)
				current = total;
			total += posi.frames[posi.length];
		}

		current += pos.frames[line];

		i = total.toString().length;
		el[4].textContent = current.toWidth(i);
		el[5].textContent = total.toWidth(i);

		el[2].textContent = (current / int).toTimeString();
		el[3].textContent = (total / int).toTimeString();
	}
	else {
		bpm = (i / this.player.currentSpeed) >> 2;

		el[2].textContent = el[3].textContent = (0).toTimeString();
		el[4].textContent = el[5].textContent = '0';
	}

	el[0].textContent = bpm;
	el[1].textContent = int;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.updatePanelPattern = function() {
	var a = [ '#scPattern', '#scPatternLen', '#btPatternDelete', '#btPatternClean', '#btPatternInfo'],
		lastState = $(a[0]).prop('disabled'),
		pat = this.workingPattern,
		len = this.player.pattern.length,
		min = 0, max = 0,
		d = true, i;

	len--;
	if (len) {
		min = 1;
		max = len;
		pat = Math.max(Math.min(pat, max), min);
	}
	else
		pat = 0;

	for (i = 1; i <= 6; i++)
		$('#scChnPattern' + i).trigger('touchspin.updatesettings', { min: 0, max: max });

	if (pat) {
		d = false;
		$(a[1]).val(this.player.pattern[pat].end);
	}
	else
		$(a[1]).val(64);

	this.workingPattern = pat;
	$(a[0]).trigger('touchspin.updatesettings', { min: min, max: max, initval: pat }).val(pat);

	$('#txPatternUsed').val(this.player.countPatternUsage(pat));
	$('#txPatternTotal').val(len);

	if (d !== lastState) {
		for (i = 0, len = a.length; i < len; i++)
			$(a[i] + ',' + a[i] + '~span>button').prop('disabled', d);
	}
};
//---------------------------------------------------------------------------------------
Tracker.prototype.updatePanelPosition = function () {
	var a = [ '#scPosCurrent', '#scPosLength', '#scPosSpeed', '#txPosTotal', '#scPosRepeat' ],
		lastState = $(a[0]).prop('disabled'),
		pos = this.player.nullPosition, buf,
		len = this.player.position.length,
		p = this.player.currentPosition,
		d = true, i;

	if (len) {
		d = false;
		$(a[0] + ',' + a[4]).trigger('touchspin.updatesettings', { min: 1, max: len });
		$(a[0]).val(p + 1);
		$(a[3]).val(len);
		$(a[4]).val(this.player.repeatPosition + 1);

		pos = this.player.position[p];
	}
	else {
		$(a[0] + ',' + a[4]).val(0).trigger('touchspin.updatesettings', { min: 0, max: 0 });
		$(a[3]).val(0);
	}

	$(a[1]).val(pos.length);
	$(a[2]).val(pos.speed);

	for (i = 0; i < 6; i++) {
		a.push((buf = '#scChnPattern' + (i + 1)));
		$(buf).val(pos.ch[i].pattern);

		a.push((buf = '#scChnTrans' + (i + 1)));
		$(buf).val(pos.ch[i].pitch);
	}

	if (d !== lastState) {
		a.splice(3, 1);
		for (i = 0, len = a.length; i < len; i++)
			$(a[i] + ',' + a[i] + '~span>button').prop('disabled', d);
	}

	pos = null;
};
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Tracker.prototype.onCmdFileNew = function () {
	var file = this.file;
	if (this.modePlay || !file.yetSaved && !file.modified && !file.fileName)
		return;

	$('#dialoque').confirm({
		title: 'Create new file\u2026',
		text: 'Do you really want to clear all song data and lost all of your changes?',
		buttons: 'yesno',
		style: 'danger',
		callback: function (btn) {
			if (btn !== 'yes')
				return;
			file.new();
		}
	});
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdFileOpen = function () {
	if (this.modePlay)
		return;

	var file = this.file;
	if (file.modified) {
		$('#dialoque').confirm({
			title: 'Open file\u2026',
			text: 'You should lost all of your changes! Do you really want to continue?',
			buttons: 'yesno',
			style: 'warning',
			callback: function (btn) {
				if (btn !== 'yes')
					return;
				file.dialog('load');
			}
		});
	}
	else
		file.dialog('load');
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdFileSave = function (as) {
	if (this.modePlay || !this.player.position.length)
		return;

	var file = this.file;
	if (as || !file.yetSaved || file.modified)
		file.dialog('save');
	else if (!as && file.yetSaved && file.fileName)
		file.saveFile(file.fileName, $('#stInfoPanel u:eq(3)').text());
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdStop = function () {
	this.player.stopChannel();
	this.modePlay = false;
	this.globalKeyState.lastPlayMode = 0;

	if (this.activeTab === 0)
		this.updateTracklist(true);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSongPlay = function () {
	if (this.globalKeyState.lastPlayMode === 2)
		return;
	if (this.activeTab === 0)
		this.doc.setStatusText();
	this.modePlay = this.player.playPosition(false, true, true);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSongPlayStart = function () {
	if (this.activeTab === 0)
		this.doc.setStatusText();
	this.modePlay = this.player.playPosition(true, true, true);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPosPlay = function () {
	if (this.globalKeyState.lastPlayMode === 1)
		return;
	if (this.activeTab === 0)
		this.doc.setStatusText();
	this.modePlay = this.player.playPosition(false, false, false);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPosPlayStart = function () {
	if (this.activeTab === 0)
		this.doc.setStatusText();
	this.modePlay = this.player.playPosition(false, false, true);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdToggleLoop = function (newState) {
	var state = (typeof newState === 'boolean') ? newState : (this.player.loopMode = !this.player.loopMode),
		el = $('a#miToggleLoop>span'),
		icon1 = 'glyphicon-repeat', icon2 = 'glyphicon-remove-circle',
		glyph = state ? icon1 : icon2,
		color = state ? '#000' : '#ccc';

	el.removeClass(icon1 + ' ' + icon2);
	el.addClass(glyph).css({ 'color': color });
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdToggleEditMode = function (newState) {
	var state = (typeof newState === 'boolean') ? newState : (this.modeEdit = !this.modeEdit),
		el = $('.tracklist-panel');

	if (!state)
		this.doc.setStatusText();

	el[state ? 'addClass' : 'removeClass']('edit');
	this.updateTracklist(true);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdShowDocumentation = function (name) {
	var filename = 'doc/' + name + '.txt',
		cache = this.doc.txtCache,
		data = cache[name],

		dialog = $('#documodal'),
		button = $('<button/>').attr({
			'type': 'button',
			'class': 'close',
			'data-dismiss': 'modal'
		}).text('\xd7');

	if (!!data)
		dialog.modal('show')
			.on('hidden.bs.modal', function () { $(this).find('.modal-body').empty() })
			.find('.modal-body')
			.html(data)
			.prepend(button);

	else {
		$.ajax(filename, {
			cache: true,
			contentType: 'text/plain',
			dataType: 'text',
			isLocal: true,
			success: function (data) {
				data = ('<pre>\n' + data + '</pre>')
					.replace(/\s*?^\=\=\s*([^\=]+?)\s*[\=\s]+$/gm, '</pre><h3>$1</h3><pre>')
					.replace(/<pre><\/pre>/g, '');

				cache[name] = data;
				dialog.modal('show')
					.on('hidden.bs.modal', function () { $(this).find('.modal-body').empty() })
					.find('.modal-body')
					.html(data)
					.prepend(button);
			}
		});
	}
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdAbout = function () {
	var dialog = $('#about'),
		data = dialog.data();

	if (!data.hasOwnProperty('bs.modal'))
		dialog.find('.ver').text('v' + this.version);

	dialog.modal('toggle');
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPatCreate = function () {
	if (this.modePlay)
		return;

	var id = this.player.addNewPattern(),
		pt = this.player.pattern[id],
		len = (this.workingPattern && this.player.pattern[this.workingPattern].end) || 64;

	pt.end = len;
	this.workingPattern = id;
	this.updatePanelPattern();
	this.file.modified = true;

	$('#scPatternLen').focus();
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPatDelete = function () {
	if (this.modePlay || !this.workingPattern)
		return;

	var app = this,
		p = this.player,
		pt = this.workingPattern,
		len = p.pattern.length - 1,
		msg = null;

	if (p.countPatternUsage(pt) > 0)
		msg = 'This pattern is used in some positions!\nAre you sure to delete it?';
	if (pt !== len)
		msg = 'This is not the last pattern in a row and there is necessary to renumber all of the next patterns in the positions!\n\nPlease, take a note that all of your undo history will be lost because of pattern/position data inconsistency that occurs with this irreversible operation.\n\nDo you really want to continue?';
	if (!msg)
		msg = 'Are you sure to delete this pattern?';

	$('#dialoque').confirm({
		title: 'Delete pattern\u2026',
		text: msg,
		buttons: 'yesno',
		style: (pt !== len) ? 'warning' : 'info',
		callback: function (btn) {
			if (btn !== 'yes')
				return;

			for (var i = 0, l = p.position.length, pos, chn; i < l; i++) {
				for (pos = p.position[i], chn = 0; chn < 6; chn++) {
					if (pos.ch[chn].pattern === pt)
						pos.ch[chn].pattern = 0;
					else if (pos.ch[chn].pattern > pt)
						pos.ch[chn].pattern--;
				}
			}

			p.pattern.splice(pt, 1);
			if (pt === len)
				pt--;

			app.workingPattern = pt;
			app.updatePanelInfo();
			app.updatePanelPattern();
			app.updatePanelPosition();
			app.updateTracklist();
			app.file.modified = true;
		}
	});
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPatClean = function () {
	if (this.modePlay || !this.workingPattern)
		return;

	var app = this,
		pt = this.player.pattern[this.workingPattern].data;

	$('#dialoque').confirm({
		title: 'Clean pattern\u2026',
		text: 'Are you ready to clean a content of this pattern?',
		buttons: 'yesno',
		style: 'info',
		callback: function (btn) {
			if (btn !== 'yes')
				return;

			for (var i = 0, data = pt[i]; i < Player.maxPatternLen; i++, data = pt[i]) {
				data.tone = 0;
				data.release = false;
				data.smp = 0;
				data.orn = 0;
				data.orn_release = false;
				data.volume.byte = 0;
				data.cmd = 0;
				data.cmd_data = 0;
			}

			app.updatePanelInfo();
			app.updateTracklist();
			app.file.modified = true;
		}
	});
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPatInfo = function () {
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPosCreate = function () {
	if (this.modePlay)
		return;

	var p = this.player,
		total = p.position.length,
		current = p.position[p.currentPosition] || p.nullPosition,
		ps = new pPosition(current.length, current.speed);

	p.position.push(ps);
	p.countPositionFrames(total);
	p.currentPosition = total;
	p.currentLine = 0;

	this.updatePanelInfo();
	this.updatePanelPosition();
	this.updateTracklist();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPosInsert = function () {
	if (this.modePlay)
		return;
	if (!this.player.position.length)
		return this.onCmdPosCreate();

	var p = this.player, chn,
		i = p.currentPosition,
		current = p.position[i] || p.nullPosition,
		pt = new pPosition(current.length, current.speed);

	for (chn = 0; chn < 6; chn++) {
		pt.ch[chn].pattern = current.ch[chn].pattern;
		pt.ch[chn].pitch = current.ch[chn].pitch;
	}

	p.position.splice(i, 0, pt);
	p.countPositionFrames(i);
	p.currentLine = 0;

	this.updatePanelInfo();
	this.updatePanelPattern();
	this.updatePanelPosition();
	this.updateTracklist();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPosDelete = function () {
	if (this.modePlay || !this.player.position.length)
		return;

	var app = this;
	$('#dialoque').confirm({
		title: 'Delete position\u2026',
		text: 'Are you ready to delete this position?',
		buttons: 'yesno',
		style: 'info',
		callback: function (btn) {
			if (btn !== 'yes')
				return;

			app.player.position.splice(app.player.currentPosition, 1);
			app.player.currentLine = 0;

			app.updatePanelInfo();
			app.updatePanelPattern();
			app.updatePanelPosition();
			app.updateTracklist();
			app.file.modified = true;
		}
	});
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPosMoveUp = function () {
	var p = this.player,
		i = p.currentPosition,
		swap = p.position[i];

	if (this.modePlay || !p.position.length || !i)
		return;

	p.position[i] = p.position[--i];
	p.position[i] = swap;

	p.currentPosition = i;
	p.currentLine = 0;

	this.updatePanelInfo();
	this.updatePanelPosition();
	this.updateTracklist();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdPosMoveDown = function () {
	var p = this.player,
		i = p.currentPosition,
		total = p.position.length,
		swap = p.position[i];

	if (this.modePlay || !total || i === (total - 1))
		return;

	p.position[i] = p.position[++i];
	p.position[i] = swap;

	p.currentPosition = i;
	p.currentLine = 0;

	this.updatePanelInfo();
	this.updatePanelPosition();
	this.updateTracklist();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpPlay = function () {
	this.player.playSample(this.workingSample, 0, this.workingSampleTone);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpClear = function () {
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpSwap = function () {
	for (var data = this.player.sample[this.workingSample].data, swap, i = 0; i < 256; i++) {
		swap = data[i].volume.L;
		data[i].volume.L = data[i].volume.R;
		data[i].volume.R = swap;
	}

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpLVolUp = function () {
	for (var smp = this.player.sample[this.workingSample], data = smp.data, i = 0; i < 256; i++) {
		if ((i <  smp.end && data[i].volume.L < 15) ||
			(i >= smp.end && data[i].volume.L > 0 && data[i].volume.L < 15))
				data[i].volume.L++;
	}

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpLVolDown = function () {
	for (var data = this.player.sample[this.workingSample].data, i = 0; i < 256; i++)
		if (data[i].volume.L > 0)
			data[i].volume.L--;

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpRVolUp = function () {
	for (var smp = this.player.sample[this.workingSample], data = smp.data, i = 0; i < 256; i++) {
		if ((i <  smp.end && data[i].volume.R < 15) ||
			(i >= smp.end && data[i].volume.R > 0 && data[i].volume.R < 15))
				data[i].volume.R++;
	}

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpRVolDown = function () {
	for (var data = this.player.sample[this.workingSample].data, i = 0; i < 256; i++)
		if (data[i].volume.R > 0)
			data[i].volume.R--;

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpCopyLR = function () {
	for (var data = this.player.sample[this.workingSample].data, i = 0; i < 256; i++)
		data[i].volume.R = data[i].volume.L;

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpCopyRL = function () {
	for (var data = this.player.sample[this.workingSample].data, i = 0; i < 256; i++)
		data[i].volume.L = data[i].volume.R;

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpRotL = function () {
	var i = 0, ref,
		data = this.player.sample[this.workingSample].data,
		backup = $.extend(true, {}, data[i]);

	for (; i < 256; i++) {
		ref = (i < 255) ? data[i + 1] : backup;

		data[i].volume.byte  = ref.volume.byte;
		data[i].enable_freq  = ref.enable_freq;
		data[i].enable_noise = ref.enable_noise;
		data[i].noise_value  = ref.noise_value;
		data[i].shift        = ref.shift;
	}

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpRotR = function () {
	var i = 255, ref,
		data = this.player.sample[this.workingSample].data,
		backup = $.extend(true, {}, data[i]);

	for (; i >= 0; i--) {
		ref = (i > 0) ? data[i - 1] : backup;

		data[i].volume.byte  = ref.volume.byte;
		data[i].enable_freq  = ref.enable_freq;
		data[i].enable_noise = ref.enable_noise;
		data[i].noise_value  = ref.noise_value;
		data[i].shift        = ref.shift;
	}

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpEnable = function () {
	for (var data = this.player.sample[this.workingSample].data, i = 0; i < 256; i++)
		if (!!data[i].volume.byte)
			data[i].enable_freq = true;

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdSmpDisable = function () {
	for (var data = this.player.sample[this.workingSample].data, i = 0; i < 256; i++)
		data[i].enable_freq = false;

	this.updateSampleEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnPlay = function () {
	this.player.playSample(this.workingOrnTestSample, this.workingOrnament, this.workingSampleTone);
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnClear = function () {
	var orn = this.player.ornament[this.workingOrnament];

	orn.data.fill(0);
	orn.loop = orn.end = 0;

	this.smpornedit.updateOrnamentEditor(true);
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnShiftLeft = function () {
	var i = 0,
		data = this.player.ornament[this.workingOrnament].data,
		ref = data[i];

	for (; i < 256; i++)
		data[i] = (i < 255) ? data[i + 1] : ref;

	this.smpornedit.updateOrnamentEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnShiftRight = function () {
	var i = 255,
		data = this.player.ornament[this.workingOrnament].data,
		ref = data[i];

	for (; i >= 0; i--)
		data[i] = (i > 0) ? data[i - 1] : ref;

	this.smpornedit.updateOrnamentEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnTransUp = function () {
	for (var orn = this.player.ornament[this.workingOrnament], l = orn.end, i = 0; i < l; i++)
		orn.data[i]++;

	this.smpornedit.updateOrnamentEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnTransDown = function () {
	for (var orn = this.player.ornament[this.workingOrnament], l = orn.end, i = 0; i < l; i++)
		orn.data[i]--;

	this.smpornedit.updateOrnamentEditor();
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnCompress = function () {
	var orn = this.player.ornament[this.workingOrnament],
		data = orn.data,
		i = 0, k = 0;

	for (; k < 256; i++, k += 2)
		data[i] = data[k];
	data.fill(0, i);

	orn.loop >>= 1;
	orn.end >>= 1;

	this.smpornedit.updateOrnamentEditor(true);
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.onCmdOrnExpand = function () {
	var orn = this.player.ornament[this.workingOrnament],
		data = orn.data,
		i = 127, k = 256;

	for (; k > 0; i--) {
		data[--k] = data[i];
		data[--k] = data[i];
	}

	orn.loop <<= 1;
	orn.end <<= 1;

	this.smpornedit.updateOrnamentEditor(true);
	this.file.modified = true;
};
//---------------------------------------------------------------------------------------
/** Tracker.keyboard submodule */
//---------------------------------------------------------------------------------------
/*
	JavaScript KeyboardEvent keymap:
		  8      Backspace
		  9      Tab
		 13      Enter
		 16      Shift
		 17      Ctrl
		 18      Alt
		 19      Pause
		 20      CapsLock
		 27      Esc
		 32      Space
		 33      PageUp
		 34      PageDown
		 35      End
		 36      Home
		 37      Left
		 38      Up
		 39      Right
		 40      Down
		 44      PrtScr
		 45      Insert
		 46      Delete
		 48-57   0 to 9
		 65-90   A to Z
		 91      Win (left)
		 92      Win (right)
		 93      Menu
		 96-105  Num0 to Num9
		106      Numpad *
		107      Numpad +
		109      Numpad -
		110      Numpad .
		111      Numpad /
		112-123  F1 to F12
		144      NumLock
		145      ScrLock
		173      Mute    (Firefox: 181)
		174      VolDown (Firefox: 182)
		175      VolUp   (Firefox: 183)
		186      ; :     (Firefox:  59)
		187      = +     (Firefox:  61)
		189      - _     (Firefox: 173)
		188      , <
		190      . >
		191      / ?
		192      ` ~
		219      [ {     (Opera: Win)
		220      \ |
		221      ] }
		222      ' "
*/
//---------------------------------------------------------------------------------------
Tracker.prototype.hotkeyMap = function (type, group, key) {
	var app = this,
		cursors = (key > 32 && key < 41),
		keyup = /keyup|test/.test(type),
		keydown = /keydown|test/.test(type);

	switch (group) {
		case 'globalCtrl':
			if (!keyup)
				return;

			return {
				79: function () {
					console.logHotkey('Ctrl+O - Open');
				},
				83: function () {
					console.logHotkey('Ctrl+S - Save');
				},
				89: function () {
					console.logHotkey('Ctrl+Y - Redo');
				},
				90: function () {
					console.logHotkey('Ctrl+Z - Undo');
				}
			}[key];

		case 'globalFs':
			if (!keydown)
				return;

			return {
				27: function () {
					console.logHotkey('Esc - Stop');
					if (app.modePlay)
						app.onCmdStop();
					else if (app.modeEdit)
						app.onCmdToggleEditMode();
				},
				112: function () {
					console.logHotkey('F1 - About');
					app.onCmdAbout();
				},
				113: function () {
					console.logHotkey('F2 - Tracklist Editor');
					$('#tab-tracker').tab('show');
				},
				114: function () {
					console.logHotkey('F3 - Sample Editor');
					$('#tab-smpedit').tab('show');
				},
				115: function () {
					console.logHotkey('F4 - Ornament Editor');
					$('#tab-ornedit').tab('show');
				},
				116: function () {
					console.logHotkey('F5 - Play song');
					app.onCmdSongPlay();
				},
				117: function () {
					console.logHotkey('F6 - Play song from start');
					app.onCmdSongPlayStart();
				},
				118: function () {
					console.logHotkey('F7 - Play position');
					app.onCmdPosPlay();
				},
				119: function () {
					console.logHotkey('F8 - Play position from start');
					app.onCmdPosPlayStart();
				},
				120: function () {
					console.logHotkey('F9 - Track manager');
				},
				121: function () {
					console.logHotkey('F10 - Preferences');
				},
				122: function () {
					console.logHotkey('F11 - Toggle loop');
					app.onCmdToggleLoop();
				},
				123: function () {
					console.logHotkey('F12 - Unimplemented');
				}
			}[key];

		case 'trackerCtrl':
			if (!((type === 'repeat' && ([38,40,48,57].indexOf(key) >= 0)) || keydown))
				return;

			// unite bunch of keys into one handler...
			if (key > 96 && key < 103)     // Numpad1-Numpad6 (toggle channels)
				key = 96;
			else if (key > 48 && key < 57) // numbers 1-8 (octave)
				key = 56;

			return {
				38: function () {
					console.logHotkey('Up - Cursor movement backward to every 16th line (signature)');

					var cl = app.player.currentLine;
					if (cl >= 16 && (cl & 0xf0) === cl)
						cl = 16;
					else
						cl = (cl & 0x0f);

					if (!cl)
						return false;

					app.updateEditorCombo(-cl);
				},
				40: function () {
					console.logHotkey('Down - Cursor movement forward to every 16th line (signature)');

					var pp = app.player.position[app.player.currentPosition] || app.player.nullPosition,
						cl = app.player.currentLine,
						pl = pp.length;

					if (cl < (pl - 16))
						cl = 16 - (cl & 0x0f);
					else
						cl = pl - cl - 1;

					app.updateEditorCombo(cl);
				},
				48: function () {
					console.logHotkey('Ctrl+0 - Increase rowstep');
					app.ctrlRowStep = parseInt($('#scRowStep').trigger('touchspin.uponce').val(), 10);
				},
				56: function (oct) {
					oct -= 48;
					console.logHotkey('Ctrl+' + oct + ' - Set octave');
					$('#scOctave').val(oct);
					app.ctrlOctave = oct;
				},
				57: function () {
					console.logHotkey('Ctrl+9 - Decrease rowstep');
					app.ctrlRowStep = parseInt($('#scRowStep').trigger('touchspin.downonce').val(), 10);
				},
				96: function (chn) {
					chn -= 96;
					console.logHotkey('Ctrl+Num' + chn + ' - Toggle channel');
					$('#scChnButton' + chn).bootstrapToggle('toggle');
				}
			}[key];

		case 'trackerCtrlShift':
			if (!keyup)
				return;

			// unite Numpad +/- into one handler (transposition)
			if (key === 109)
				key = 107;

			return {
				37: function () {
					console.logHotkey('Ctrl+Shift+Left - Previous position');
					$('#scPosCurrent').trigger('touchspin.downonce');
				},
				39: function () {
					console.logHotkey('Ctrl+Shift+Right - Next position');
					$('#scPosCurrent').trigger('touchspin.uponce');
				},
				107: function(plus) {
					if (!app.modeEdit)
						return;

					plus &= 2;
					console.logHotkey('Ctrl+Shift+Num' + (!!plus ? 'Plus' : 'Minus') + ' - Transpose octave');

					var p = app.player, t,
						sel = app.tracklist.selection,
						ch = sel.len ? sel.channel : app.modeEditChannel,
						line = sel.len ? sel.line : p.currentLine,
						end = line + sel.len,
						pos = p.position[p.currentPosition] || p.nullPosition,
						pp = p.pattern[pos.ch[ch].pattern];

					for (plus = (plus - 1) * 12; line <= end; line++) {
						if (line >= pp.end)
							break;

						if (!(t = pp.data[line].tone))
							continue;

						t += plus;
						if (t > 0 && t <= 96)
							pp.data[line].tone = t;
					}

					app.updateTracklist();
				}
			}[key];

		case 'editorShift':
			if (!keydown || !app.modeEdit || !app.player.position.length)
				return;

			return {
				9: function () {
					console.logHotkey('Shift+Tab - Previous channel');
					if (app.modeEditChannel > 0)
						app.modeEditChannel--;
					else
						app.modeEditChannel = 5;

					app.updateTracklist();
				}
			}[key];

		case 'editorKeys':
			if (!(keydown || (type === 'repeat' && cursors)))
				return;

			// unite Numpad +/- into one handler (transposition)
			if (key === 109)
				key = 107;

			if (cursors) {
				if (app.modePlay)
					app.onCmdStop();
				else if (!app.player.position.length || (!app.modeEdit && app.modePlay))
					return;
			}

			return {
				9: function () {
					if (!app.player.position.length || !app.modeEdit)
						return;

					console.logHotkey('Tab - Next channel');
					if (app.modeEditChannel < 5)
						app.modeEditChannel++;
					else
						app.modeEditChannel = 0;

					app.updateTracklist();
				},
				32: function () {
					console.logHotkey('Space - Edit mode');
					if (app.modePlay)
						app.onCmdStop();
					if (app.player.position.length)
						app.onCmdToggleEditMode();
				},
				33: function () {
					console.logHotkey('PageUp - Move cursor up by half of tracklines');

					var lines = app.settings.tracklistLines + 1;
					app.tracklist.moveCurrentline(-(lines >> 1), true);
					app.updateTracklist();
					app.updatePanelInfo();
				},
				34: function () {
					console.logHotkey('PageDown - Move cursor down by half of tracklines');

					var lines = app.settings.tracklistLines + 1;
					app.tracklist.moveCurrentline((lines >> 1), true);
					app.updateTracklist();
					app.updatePanelInfo();
				},
				35: function () {
					console.logHotkey('End - Move cursor to end of the position');
					app.tracklist.moveCurrentline(Player.maxPatternLen, true);
					app.updateTracklist();
					app.updatePanelInfo();
				},
				36: function () {
					console.logHotkey('Home - Move cursor to start of the position');
					app.tracklist.moveCurrentline(-Player.maxPatternLen, true);
					app.updateTracklist();
					app.updatePanelInfo();
				},
				37: function () {
					if (!app.modeEdit)
						return;

					console.logHotkey('Left - Cursor movement');
					if (app.modeEditColumn > 0)
						app.modeEditColumn--;
					else {
						app.modeEditColumn = 7;
						if (app.modeEditChannel > 0)
							app.modeEditChannel--;
						else
							app.modeEditChannel = 5;
					}

					app.updateTracklist();
				},
				38: function () {
					console.logHotkey('Up - Cursor movement');
					app.updateEditorCombo(-1);
				},
				39: function () {
					if (!app.modeEdit)
						return;

					console.logHotkey('Right - Cursor movement');
					if (app.modeEditColumn < 7)
						app.modeEditColumn++;
					else {
						app.modeEditColumn = 0;
						if (app.modeEditChannel < 5)
							app.modeEditChannel++;
						else
							app.modeEditChannel = 0;
					}

					app.updateTracklist();
				},
				40: function () {
					console.logHotkey('Down - Cursor movement');
					app.updateEditorCombo(1);
				},
				107: function(plus) {
					if (!app.modeEdit)
						return;

					plus &= 2;
					console.logHotkey('Num' + (!!plus ? 'Plus' : 'Minus') + ' - Transpose half-tone');

					var p = app.player,
						sel = app.tracklist.selection,
						ch = sel.len ? sel.channel : app.modeEditChannel,
						line = sel.len ? sel.line : p.currentLine,
						end = line + sel.len,
						pos = p.position[p.currentPosition] || p.nullPosition,
						pp = p.pattern[pos.ch[ch].pattern];

					for (--plus; line <= end; line++)
						if (line >= pp.end)
							break;
						else if (pp.data[line].tone)
							pp.data[line].tone = Math.min(Math.max(pp.data[line].tone + plus, 1), 96);

					app.updateTracklist();
				}
			}[key];

		case 'editorEdit':
			if (!keydown)
				return;

			var cl = app.player.currentLine,
				pp = app.player.position[app.player.currentPosition] || app.player.nullPosition,
				cp = pp.ch[app.modeEditChannel].pattern,
				pt = app.player.pattern[cp],
				pl = pt.data[cl];

			if (cl < pt.end) switch (key) {
				case 8:
					return function () {
						console.logHotkey('Backspace - Delete trackline from pattern');

						var A = cl + 1, B = cl, data = pt.data,
							max = Player.maxPatternLen - 1;

						for (; A < max; A++, B++) {
							data[B].tone = data[A].tone;
							data[B].release = data[A].release;
							data[B].smp = data[A].smp;
							data[B].orn = data[A].orn;
							data[B].orn_release = data[A].orn_release;
							data[B].volume.byte = data[A].volume.byte;
							data[B].cmd = data[A].cmd;
							data[B].cmd_data = data[A].cmd_data;
						}

						data[A].tone = data[A].smp = data[A].orn = 0;
						data[A].release = data[A].orn_release = false;
						data[A].cmd = data[A].cmd_data = data[A].volume.byte = 0;

						app.updateTracklist();
					};

				case 45:
					return function () {
						console.logHotkey('Insert - New trackline into pattern');

						var max = Player.maxPatternLen,
							A = max - 2, B = max - 1, data = pt.data;

						for (; A >= cl; A--, B--) {
							data[B].tone = data[A].tone;
							data[B].release = data[A].release;
							data[B].smp = data[A].smp;
							data[B].orn = data[A].orn;
							data[B].orn_release = data[A].orn_release;
							data[B].volume.byte = data[A].volume.byte;
							data[B].cmd = data[A].cmd;
							data[B].cmd_data = data[A].cmd_data;
						}

						data[B].tone = data[B].smp = data[B].orn = 0;
						data[B].release = data[B].orn_release = false;
						data[B].cmd = data[B].cmd_data = data[B].volume.byte = 0;

						app.updateTracklist();
					};

				case 46:
					return function () {
						console.logHotkey('Delete - Clear trackline data');

						switch (app.modeEditColumn) {
							default: case 0:		// NOTE column
								pl.tone = 0;
								pl.release = 0;
								break;
							case 1: 				// SAMPLE column
								pl.smp = 0;
								break;
							case 2: 				// ORNAMENT column
								pl.orn = 0;
								pl.orn_release = 0;
								break;
							case 3: case 4:			// ATTENUATION columns
								pl.volume.byte = 0;
								break;
							case 5: 				// COMMAND column
								pl.cmd = 0;
								pl.cmd_data = 0;
								break;
							case 6: 				// COMMAND DATA 1 column
								pl.cmd_data &= 0x0F;
								break;
							case 7: 				// COMMAND DATA 2 column
								pl.cmd_data &= 0xF0;
								break;
						}

						app.updateEditorCombo();
					};

				default:
					var columnHandler = {
					// NOTE column
						0: function (key, test) {
							var tone = Math.min(app.getKeynote(key), 96);

							if (tone < 0)
								return false;
							else if (test)
								return true;
							else if (tone > 0) {
								pl.release = false;
								pl.tone = tone;
								if (app.ctrlSample && !pl.smp)
									pl.smp = app.ctrlSample;
								if (app.ctrlOrnament && !pl.orn) {
									pl.orn = app.ctrlOrnament;
									pl.orn_release = false;
								}
							}
							else {
								pl.release = true;
								pl.tone = 0;
								pl.smp = 0;
								pl.orn = 0;
								pl.orn_release = false;
							}

							app.updateEditorCombo();
						},
					// SAMPLE column
						1: function (key, test) {
							if (key >= 48 && key <= 57) { // 0 - 9
								if (test)
									return true;

								pl.smp = (key - 48);
							}
							else if (key >= 65 && key <= 86) { // A - V
								if (test)
									return true;

								pl.smp = (key - 55);
							}
							else
								return false;

							app.updateEditorCombo();
						},
					// ORNAMENT column
						2: function (key, test) {
							if (key >= 48 && key <= 57) { // 0 - 9
								if (test)
									return true;

								pl.orn_release = false;
								pl.orn = (key - 48);
							}
							else if (key >= 65 && key <= 70) { // A - F
								if (test)
									return true;

								pl.orn_release = false;
								pl.orn = (key - 55);
							}
							else if (key === 88 || key === 189) { // X | -
								if (test)
									return true;

								pl.orn_release = true;
								pl.orn = 0;
							}
							else
								return false;

							app.updateEditorCombo();
						},
					// ATTENUATION 1 column
						3: function (key, test) {
							if (key >= 48 && key <= 57) { // 0 - 9
								if (test)
									return true;

								pl.volume.L = (key - 48);
							}
							else if (key >= 65 && key <= 70) { // A - F
								if (test)
									return true;

								pl.volume.L = (key - 55);
							}
							else
								return false;

							app.updateEditorCombo();
						},
					// ATTENUATION 2 column
						4: function (key, test) {
							if (key >= 48 && key <= 57) { // 0 - 9
								if (test)
									return true;

								pl.volume.R = (key - 48);
							}
							else if (key >= 65 && key <= 70) { // A - F
								if (test)
									return true;

								pl.volume.R = (key - 55);
							}
							else
								return false;

							app.updateEditorCombo();
						},
					// COMMAND column
						5: function (key, test) {
							if (key >= 48 && key <= 57) { // 0 - 9
								if (test)
									return true;

								pl.cmd = (key - 48);
							}
							else if (key >= 65 && key <= 70) { // A - F
								if (test)
									return true;

								pl.cmd = (key - 55);

								// recalculate position frames if we changing speed
								if (pl.cmd == 0xF && pl.cmd_data)
									app.player.countPositionFrames(app.player.currentPosition);
							}
							else return;

							app.updateEditorCombo();
						},
					// COMMAND DATA 1 column
						6: function (key, test) {
							if (key >= 48 && key <= 57) // 0 - 9
								key -= 48;
							else if (key >= 65 && key <= 70) // A - F
								key -= 55;
							else
								return false;

							if (test)
								return true;

							pl.cmd_data &= 0x0F;
							pl.cmd_data |= key << 4;

							// recalculate position frames if we changing speed
							if (pl.cmd == 0xF && pl.cmd_data)
								app.player.countPositionFrames(app.player.currentPosition);

							app.updateEditorCombo();
						},
					// COMMAND DATA 2 column
						7: function (key, test) {
							if (key >= 48 && key <= 57) // 0 - 9
								key -= 48;
							else if (key >= 65 && key <= 70) // A - F
								key -= 55;
							else
								return false;

							if (test)
								return true;

							pl.cmd_data &= 0xF0;
							pl.cmd_data |= key;

							// recalculate position frames if we changing speed
							if (pl.cmd == 0xF && pl.cmd_data)
								app.player.countPositionFrames(app.player.currentPosition);

							app.updateEditorCombo();
						}
					}[app.modeEditColumn];

					return (columnHandler(key, true)) ? columnHandler : undefined;
			}

		case 'smpornCtrl':
			if (!keydown)
				return;

			if (key > 48 && key < 57) { // numbers 1-8 (octave)
				return function (key) {
					var oct = (key - 49),
						base = app.workingSampleTone,
						tone = ((base - 1) % 12) + (oct * 12) + 1;

					if (base !== tone) {
						console.logHotkey('Ctrl+' + String.fromCharCode(key) + ' - Set octave for sample/ornament editor test tone');
						app.workingSampleTone = tone;

						$('#scSampleTone,#scOrnTone')
							.val(tone.toString())
							.prev().val(app.player.tones[tone].txt);
					}
				};
			}
			break;

		case 'smpornKeys':
			if (!keydown)
				return;

			var oct  = app.player.tones[app.workingSampleTone].oct,
				tone = Math.min(app.getKeynote(key, oct), 96),
				sample = (app.activeTab === 1) ? app.workingSample : app.workingOrnTestSample,
				ornament = (app.activeTab === 2) ? app.workingOrnament : 0;

			if (tone > 0)
				return function () { app.player.playSample(sample, ornament, tone) };
			break;

		default:
			return;
	}
};
//---------------------------------------------------------------------------------------
Tracker.prototype.handleKeyEvent = function (e) {
	var o = this.globalKeyState,
		type = e.type,
		isInput = (e.target && e.target.type === 'text'),
		isSpin = (isInput && /touchspin/.test(e.target.parentElement.className)),
		key = e.which || e.charCode || e.keyCode,
		canPlay = !!this.player.position.length;

	// cross-platform fixes
	if (browser.isOpera && key === 219)
		key = 91;
	else if (browser.isFirefox) switch (key) {
 		case 59:
 			key = 186; break;
 		case 61:
 			key = 187; break;
 		case 173:
 			key = 189; break;
 	}

	if (type === 'keydown') {
		if (key >= 16 && key <= 18) {
			o.modsHandled = false;
			if (e.location === 2)
				key += 256;
		}

		if (e.repeat || (browser.isFirefox && o[key]))
			type = 'repeat';

		// add new key to the keymapper
		else if (!o[key]) {
			o[key] = true;
			o.length++;
		}

		if ((isSpin && !this.handleHotkeys('test', key)) || (!isSpin && isInput && !o[9]))
			return true;

		if (!this.handleHotkeys(type, key)) {
			if (this.activeTab === 0) {
				// ENTER (hold to play position at current line)
				if (o[13] && o.length === 1 && canPlay && !this.modePlay && !o.lastPlayMode) {
					this.modePlay = this.player.playPosition(false, false, false);
					o.lastPlayMode = 3;
				}
				else if (o[13] && o.length > 1 && this.modePlay && o.lastPlayMode === 3) {
					this.modePlay = false;
					this.player.stopChannel();
					this.updateTracklist();
					o.lastPlayMode = 0;
				}
			}
		}

		if (isInput && o[9]) {
			delete o[9];
			o.length--;
			e.target.blur();
		}
	}
	else if (type === 'keyup') {
		if (o[key] && this.handleHotkeys(type, key))
			isInput = false;

		if (!o.modsHandled && canPlay) {
			// RIGHT SHIFT (play position)
			if (o.length === 1 && o[272]) {
				if (this.modePlay && o.lastPlayMode === 1) {
					this.modePlay = false;
					this.player.stopChannel();
					this.updateTracklist();
					o.lastPlayMode = 0;
				}
				else {
					this.modePlay = this.player.playPosition(false, false, true);
					o.lastPlayMode = 1;
				}

				o.modsHandled = true;
			}
			// RIGHT CTRL (play song)
			else if (o.length === 1 && o[273]) {
				if (this.modePlay && o.lastPlayMode === 2) {
					this.modePlay = false;
					this.player.stopChannel();
					this.updateTracklist();
					o.lastPlayMode = 0;
				}
				else {
					this.modePlay = this.player.playPosition(false, true, true);
					o.lastPlayMode = 2;
				}

				o.modsHandled = true;
			}
		}

		if (this.activeTab === 0) {
			// ENTER (hold to play position at current line)
			if (o[13] && this.modePlay && o.lastPlayMode === 3) {
				this.modePlay = false;
				this.player.stopChannel();
				this.updateTracklist();
				o.lastPlayMode = 0;
			}
		}

		// remove entry from the keymapper
		if (o[key]) {
			delete o[key];
			if (o.length)
				o.length--;
		}
		if (o[key + 256]) {
			delete o[key + 256];
			if (o.length)
				o.length--;
		}

		if (isInput)
			return true;
	}

	e.preventDefault();
	return false;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.handleHotkeys = function (type, key) {
	var o = this.globalKeyState,
		fn = false;

	if (o[17] && key !== 17) { // handle Ctrl+
		if (key === 90 && o[16]) { // convert Ctrl+Shift+Z to Ctrl+Y
			delete o[key];
			delete o[16];
			if (o.length)
				o.length--;
			o[--key] = true;
		}

		if (o.length === 2) {
			if (key === 82 || key === 116) {
				fn = true; // disable refresh browser hotkeys
				type = 'test';
			}
			else if (!(fn = this.hotkeyMap(type, 'globalCtrl', key))) {
				if (this.activeTab === 0 && !(fn = this.hotkeyMap(type, 'trackerCtrl', key)))
					fn = this.hotkeyMap(type, 'editorCtrl', key);
				else if (this.activeTab > 0)
					fn = this.hotkeyMap(type, 'smpornCtrl', key);
			}
		}
		else if (o.length === 3 && o[16] && this.activeTab === 0)
			fn = this.hotkeyMap(type, 'trackerCtrlShift', key);
	}
	else if (o[16] && key !== 16 && o.length === 2 && this.activeTab === 0)
		fn = this.hotkeyMap(type, 'editorShift', key);
	else if (o.length === 1) {
		if (!(fn = this.hotkeyMap(type, 'globalFs', key))) {
			if (this.activeTab === 0) {
				if (!(fn = this.hotkeyMap(type, 'editorKeys', key)) && this.player.position.length && this.modeEdit)
					fn = this.hotkeyMap(type, 'editorEdit', key);
			}
			else
				fn = this.hotkeyMap(type, 'smpornKeys', key);
		}
	}

	if (fn) {
		if (type !== 'test') {
			fn(key);
			o.modsHandled = true;
		}

		return true;
	}
};
//---------------------------------------------------------------------------------------
Tracker.prototype.getKeynote = function (key, octave) {
	var t = ((octave !== void 0) ? octave : (this.ctrlOctave - 1)) * 12,
		c = String.fromCharCode(key),
		i = ' ZSXDCVGBHNJMQ2W3ER5T6Y7UI9O0P'.indexOf(c);

	if (i > 0)
		return (t + i);
	else if ((i = {
		49 : 0,      // 1
		65 : 0,      // A
		192: 0,      // `
		189: 0,      // -
		222: 0,      // '
		188: t + 13, // ,
		76 : t + 14, // L
		190: t + 15, // .
		186: t + 16, // ;
		191: t + 17, // /
		219: t + 30, // [
		187: t + 31, // =
		221: t + 32  // ]
	}[key]) >= 0)
		return i;

	return -1;
};
//---------------------------------------------------------------------------------------
/** Tracker.keyboard submodule */
//---------------------------------------------------------------------------------------
Tracker.prototype.handleMouseEvent = function (part, obj, e) {
	var x = e.pageX || 0, y = e.pageY || 0;
	var leftButton = browser.isFirefox
			? (!!(e.buttons & 1) || (e.type !== 'mousemove' && e.button === 0))
			: (e.which === 1);

	if (part === 'tracklist') {
		var redraw = false,
			p = this.player,
			pp = p.position[p.currentPosition],
			sel = obj.selection,
			offset = obj.canvasData.offset,
			point = obj.pointToTracklist(x - offset.left, y - offset.top),
			line = p.currentLine, i;

		if (this.modePlay || !pp)
			return;

		if (point) {
			point.line = Math.min(point.line, pp.length - 1);
			i = point.line - sel.start.line;
		}
		else if (e.type !== 'mousewheel')
			return;

		if (e.type === 'mousewheel') {
			e.target.focus();

			if (e.delta < 0)
				obj.moveCurrentline(1);
			else if (e.delta > 0)
				obj.moveCurrentline(-1);
			redraw = true;
		}
		else if (e.type === 'mousedown') {
			e.target.focus();

			if (leftButton && point.line < pp.length)
				sel.start.set(point);
		}
		else if (e.type === 'mouseup' && leftButton) {
			if (sel.isDragging) {
				sel.len = i;
				sel.line = sel.start.line;
				sel.channel = sel.start.channel;
				sel.isDragging = false;
				redraw = true;
			}
			else {
				if (!this.modeEdit)
					this.modeEdit = redraw = true;
				if (point.line === line) {
					this.modeEditChannel = sel.start.channel;
					this.modeEditColumn = sel.start.column;
					redraw = true;
				}
			}
		}
		else if (e.type === 'dblclick' && leftButton) {
			sel.len = 0;
			sel.line = point.line;
			sel.channel = point.channel;
			sel.isDragging = false;

			this.modeEditChannel = sel.start.channel;
			this.modeEditColumn = sel.start.column;
			p.currentLine = point.line;
			redraw = true;
		}
		else if (e.type === 'mousemove' && leftButton && !point.compare(sel.start)) {
			if (i > 0) {
				sel.len = i;
				sel.line = sel.start.line;
				sel.channel = sel.start.channel;
				sel.isDragging = true;
			}

			if (point.y === (this.settings.tracklistLines - 1))
				obj.moveCurrentline(1, true);

			redraw = true;
		}

		if (redraw) {
			if (!sel.isDragging && e.type !== 'mousewheel') {
				i = 0;
				if (this.modeEditColumn >= 5)
					i = p.pattern[pp.ch[this.modeEditChannel].pattern].data[line].cmd;

				this.doc.showTracklistStatus(this.modeEditColumn, i);
			}

			this.updateTracklist();
			this.updatePanelInfo();
		}
	}
	else {
		var sample = this.player.sample[this.workingSample], data,
			dragging = /mouse(down|move)/.test(e.type),
			update = false,
			redrawAll = false, limitFrom, limitTo;

		x -= (obj.smpeditOffset.left + obj.centering);
		if (x < 0)
			return;

		x = Math.min(0 | (x / obj.columnWidth), 63) + obj.smpeditScroll;
		limitFrom = limitTo = x;
		data = sample.data[x];

		if (part === 'amp') {
			y -= obj.smpeditOffset.top.amp;

			var ampHeight = obj.amp.obj.height - 24,
				ampLeftChn = (y < obj.halfing),
				freqEnableSection = (y > (ampHeight + 3)) || obj.drag.isDragging;

			if (freqEnableSection && leftButton) {
				if (e.type === 'mousedown') {
					i = obj.drag.freqEnableState = !data.enable_freq;
					obj.drag.isDragging = true;
				}
				else if (e.type === 'mouseup') {
					i = obj.drag.freqEnableState;
					obj.drag.isDragging = false;
				}
				else if (obj.drag.isDragging && e.type === 'mousemove')
					i = obj.drag.freqEnableState;

				if (data.enable_freq !== i) {
					data.enable_freq = i;
					update = true;
				}
			}
			else if (e.type === 'mousewheel') {
				i = e.delta / Math.abs(e.delta);

				if (ampLeftChn)
					data.volume.L = Math.max(Math.min(data.volume.L + i, 15), 0);
				else
					data.volume.R = Math.max(Math.min(data.volume.R - i, 15), 0);

				update = true;
			}
			else if (dragging && leftButton) {
				if (ampLeftChn)
					data.volume.L = Math.max(15 - (0 | (y / 9)), 0);
				else
					data.volume.R = Math.max(15 - (0 | ((ampHeight - y) / 9)), 0);

				update = true;
			}
		}
		else if (part === 'noise') {
			y -= obj.smpeditOffset.top.noise;
			i = (0 | data.enable_noise) * (data.noise_value + 1);

			if (e.type === 'mousewheel') {
				i += e.delta / Math.abs(e.delta);
				update = true;
			}
			else if (dragging && leftButton) {
				i = 4 - (0 | (y / 9));
				update = true;
			}

			if (update) {
				i = Math.min(Math.max(i, 0), 4);

				data.enable_noise = !!i;
				data.noise_value = Math.max(--i, 0);
			}
		}
		else if (part === 'range' && leftButton) {
			if (e.type === 'mouseup') {
				obj.drag.isDragging = false;
				update = true;
			}
			else if (e.type === 'mousedown') {
				obj.drag.isDragging = 1;
				obj.drag.rangeStart = x;
				update = true;
			}
			else if (obj.drag.isDragging && e.type === 'mousemove') {
				obj.drag.isDragging = 2;
				update = true;
			}

			if (update) {
				if (x === obj.drag.rangeStart) {
					if (obj.drag.isDragging === 2) {
						sample.end = x + 1;
						sample.loop = x;
					}
					else if (obj.drag.isDragging === 1) {
						sample.end = ++x;
						sample.loop = x;
					}
				}
				else if (x > obj.drag.rangeStart) {
					sample.end = ++x;
					sample.loop = obj.drag.rangeStart;
				}
				else {
					sample.end = obj.drag.rangeStart + 1;
					sample.loop = x;
				}

				redrawAll = true;

				if (obj.drag.isDragging === 1)
					limitFrom = limitTo = void 0;
				else {
					limitFrom = sample.loop - 1;
					limitTo = sample.end;
				}
			}
		}

		if (update)
			this.updateSampleEditor(redrawAll, limitFrom, limitTo);
	}
};
//---------------------------------------------------------------------------------------
/** Tracker.paint submodule */
//---------------------------------------------------------------------------------------
/*
 * This method initialize pixel font pre-colored template canvas. Color combinations:
 *   0 - [ fg: BLACK, bg: WHITE ]
 *   1 - [ fg:  GRAY, bg: WHITE ]
 *   2 - [ fg: WHITE, bg: RED ]
 *   3 - [ fg:  GRAY, bg: RED ]
 *   4 - [ fg: WHITE, bg: HILITE ]
 *   5 - [ fg:  GRAY, bg: HILITE ]
 *   6 - [ fg: WHITE, bg: BLACK ]
 *   7 - [ fg:  GRAY, bg: BLACK ]
 *   8 - [ fg: WHITE, bg: DARKRED ]
 *   9 - [ fg:  GRAY, bg: DARKRED ]
 */
Tracker.prototype.initPixelFont = function (font) {
	// backgrounds (white, red, hilite, block, darkred)
	var bg = [ '#fff', '#f00', '#38c', '#000', '#800' ],
		o = this.pixelfont, i, l = bg.length * 10,
		w = font.width, copy, copyctx;

	console.log('Tracker.paint', 'Initializing pixel-font...');

	o.obj = document.createElement('canvas');
	o.obj.width = w;
	o.obj.height = l;
	o.ctx = o.obj.getContext('2d');

	for (i = 0; i < l; i += 10) {
		o.ctx.fillStyle = bg[i / 10];
		o.ctx.fillRect(0, i, w, 10);
	}

	copy = document.createElement('canvas');
	copy.width = w;
	copy.height = 5;
	copyctx = copy.getContext('2d');

	copyctx.save();
	copyctx.clearRect(0, 0, w, 5);
	copyctx.drawImage(font, 0, 0);

	copyctx.fillStyle = '#fff';
	copyctx.globalCompositeOperation = "source-in";
	copyctx.fillRect(0, 0, w, 5);
	copyctx.restore();

	for (i = 0; i < l; i += 10)
		o.ctx.drawImage(copy, 0, i);

	copyctx.save();
	copyctx.clearRect(0, 0, w, 5);
	copyctx.drawImage(font, 0, 0);

	copyctx.fillStyle = '#aaa';
	copyctx.globalCompositeOperation = "source-in";
	copyctx.fillRect(0, 0, w, 5);
	copyctx.restore();

	for (i = 5; i < l; i += 10)
		o.ctx.drawImage(copy, 0, i);

	o.ctx.drawImage(font, 0, 0);

	// throw it to the garbage...
	copyctx = null;
	copy = null;
};
//---------------------------------------------------------------------------------------
Tracker.prototype.updateTracklist = function (update) {
	var o = this.tracklist.canvasData,
		sel = this.tracklist.selection,
		offs = this.tracklist.offsets,
		player = this.player,
		hexdec = this.settings.hexTracklines,
		font = this.pixelfont.obj,
		ctx = this.tracklist.ctx,
		pos = player.currentPosition,
		pp = player.position[pos] || player.nullPosition,
		triDigitLine = (!hexdec && pp.length > 100),
		backup, pt, dat,
		w = this.tracklist.obj.width,
		h = this.settings.tracklistLineHeight,
		lines = this.settings.tracklistLines,
		half = lines >> 1,
		line = player.currentLine - half,
		buf, cc, ccb, chn, i, j, k, x, ypad, y, status,
		charFromBuf = function(i) { return (buf.charCodeAt(i || 0) - 32) * 6 };

	if (update) {
		o.center = ((w - o.lineWidth) >> 1);
		o.vpad = Math.round((h - 5) / 2);
		o.trkOffset = o.center + 24; // (2 trackline numbers + 2 padding) * fontWidth
		offs.y = [];
	}

	for (i = 0, y = 0, ypad = o.vpad; i < lines; i++, line++, ypad += h, y += h) {
		if (update)
			offs.y[i] = y;

		if (i !== half) {
			ccb = 0; // basic color combination
			ctx.clearRect(o.center - 6, y, o.lineWidth + 9, h);
		}
		else if (this.modeEdit) {
			ccb = 10; // col.combination: 2:WHITE|RED
			ctx.fillStyle = '#f00';
			ctx.fillRect(0, y, w, h);
		}
		else {
			ccb = 20; // col.combination: 4:WHITE|HILITE
			ctx.fillStyle = '#38c';
			ctx.fillRect(0, y, w, h);
		}

		if (line < 0) {
			if (!(pos && pp))
				continue;

			// prev position hints
			backup = { pp: pp, line: line };
			pp = player.position[pos - 1];
			line += pp.length;
		}
		else if (line >= pp.length) {
			if (!(pos < (player.position.length - 1) && pp))
				continue;

			// next position hints
			backup = { pp: pp, line: line };
			line -= pp.length;
			pp = player.position[pos + 1];
		}

		buf = ('00' + line.toString(hexdec ? 16 : 10)).substr(-3);

		if (triDigitLine || (!hexdec && line > 99))
			ctx.drawImage(font, charFromBuf(0), ccb, 5, 5, o.center - 6, ypad, 5, 5);

		ctx.drawImage(font, charFromBuf(1), ccb, 5, 5, o.center, ypad, 5, 5);
		ctx.drawImage(font, charFromBuf(2), ccb, 5, 5, o.center + 6, ypad, 5, 5);

		for (chn = 0; chn < 6; chn++) {
			pt = player.pattern[pp.ch[chn].pattern];
			dat = pt.data[line];

			for (j = 0; j < 8; j++) {
				x = o.trkOffset       // center + (4 * fontWidth)
				  + chn * o.chnWidth  // channel * ((12 columns + 2 padding) * fontWidth)
				  + o.columns[j];     // column offset premulitplied by fontWidth

				if (update) {
					offs.x[chn][j] = x;

					// overlapping area between channels
					if (!j && chn)
						offs.x[chn - 1][8] = x;
				}

				cc = ccb;
				if (!backup &&
					!(i === half && this.modeEdit) &&
					sel.len && sel.channel === chn &&
					line >= sel.line &&
					line <= (sel.line + sel.len)) {

					if (!j) {
						ctx.fillStyle = '#000';
						ctx.fillRect(x - 3, y, o.selWidth, h);
					}

					cc = 30; // col.combination: 6:WHITE|BLACK
				}
				else if (i === half && this.modeEdit &&
						this.modeEditChannel === chn &&
						this.modeEditColumn === j) {

					// value for statusbar
					status = (j >= 5) ? dat.cmd : 0;

					ctx.fillStyle = '#800';
					if (j)
						ctx.fillRect(x - 1, y,  7, h);
					else
						ctx.fillRect(x - 2, y, 22, h);

					cc = 40; // col.combination: 6:WHITE|DARKRED
				}

				if (line >= pt.end)
					cc += 5; // col.combination to GRAY foreground

				if (j) {
					k = -1;
					switch (j) {
						case 1:
							if (dat.smp)
								k = dat.smp;
							break;

						case 2:
							if (dat.orn_release)
								k = 33; // ('X' - 'A') + 10;
							else if (dat.orn)
								k = dat.orn;
							break;

						case 3:
							if (dat.volume.byte)
								k = dat.volume.L;
							break;

						case 4:
							if (dat.volume.byte)
								k = dat.volume.R;
							break;

						case 5:
							if (dat.cmd || dat.cmd_data)
								k = dat.cmd;
							break;

						case 6:
							if (dat.cmd || dat.cmd_data)
								k = ((dat.cmd_data & 0xf0) >> 4);
							break;

						case 7:
							if (dat.cmd || dat.cmd_data)
								k = (dat.cmd_data & 0x0f);
							break;
					}

					buf = (k < 0) ? '\x7f' : k.toString(36);
					ctx.drawImage(font, charFromBuf(), cc, 5, 5, x, ypad, 5, 5);
				}
				else {
					buf = '---';
					if (dat.release)
						buf = 'R--';
					else if (dat.tone)
						buf = player.tones[dat.tone].txt;

					ctx.drawImage(font, charFromBuf(0), cc, 5, 5, x, ypad, 5, 5);
					ctx.drawImage(font, charFromBuf(1), cc, 5, 5, x + 6, ypad, 5, 5);
					ctx.drawImage(font, charFromBuf(2), cc, 5, 5, x + 12, ypad, 5, 5);
				}
			}
		}

		if (backup) {
			pp = backup.pp;
			line = backup.line;
			backup = void 0;

			ctx.save();
			ctx.fillStyle = 'rgba(255,255,255,.75)';
			ctx.globalCompositeOperation = "xor";
			ctx.fillRect(o.center - 6, ypad, o.lineWidth + 6, 5);
			ctx.restore();
		}
	}

	if (!this.modePlay && this.modeEdit && status !== void 0)
		this.doc.showTracklistStatus(this.modeEditColumn, status);

	if (update) {
		// expand offsets to full canvas width and height
		offs.x[5][8] = w;
		offs.x[0][0] = 0;
		offs.y[i] = y;
	}
};
//---------------------------------------------------------------------------------------
Tracker.prototype.updateSampleEditor = function (update, limitFrom, limitTo) {
	var o = this.smpornedit,
		sample = this.player.sample[this.workingSample],
		amp = o.amp.ctx,
		noise = o.noise.ctx,
		range = o.range.ctx,
		pixel = amp.getImageData(22, 0, 1, 1),
		color, data,
		half = o.halfing,
		ptr = o.smpeditScroll,
		end = ptr + 64,
		add = o.columnWidth,
		x = o.centering, w = add - 1,
		i, yl, yr, l, r;

	if (limitFrom !== void 0) {
		i = Math.max(ptr, limitFrom);
		x += (i - ptr) * add;
		ptr = i;
	}
	if (limitTo !== void 0)
		end = Math.min(end, ++limitTo);

	for (; ptr < end; ptr++, x += add) {
		if (ptr >= sample.end && !sample.releasable)
			color = '#888';
		else if (sample.loop != sample.end && ptr >= sample.loop && ptr < sample.end)
			color = '#38c';
		else
			color = '#000';

		range.strokeStyle =
		  range.fillStyle =
		  noise.fillStyle =
		  amp.strokeStyle =
		    amp.fillStyle = color;

		data = sample.data[ptr];
		l = data.volume.L;
		r = data.volume.R;
		yl = half - 12;
		yr = half + 5;

		for (i = 0; i < 15; i++, yl -= 9, yr += 9) {
			amp.clearRect(x, yl, w, 8);
			amp.putImageData(pixel, x, yl + 7);

			if (i < l)
				amp.fillRect(x, yl, w, 8);

			amp.clearRect(x, yr, w, 8);
			amp.putImageData(pixel, x, yr);

			if (i < r)
				amp.fillRect(x, yr, w, 8);
		}

		amp.clearRect(x, 292, w, 12);
		amp.strokeRect(x - 0.5, 291.5, w - 1, 12);

		if (data.enable_freq)
			amp.fillRect(x + 1, 293, w - 4, 9);

		for (i = 0, yl = 34; i < 4; i++, yl -= 9) {
			noise.clearRect(x, yl, w, 8);
			noise.putImageData(pixel, x, yl + 7);

			if (data.enable_noise && i <= data.noise_value)
				noise.fillRect(x, yl, w, 8);
		}

		range.clearRect(x, 4, 12, 8);

		if (ptr >= sample.end)
			range.fillRect(x, 12, 12, 1);
		else {
			range.fillRect(x, 10, 12, 3);

			if (sample.loop <= sample.end && ptr === (sample.end - 1)) {
				range.beginPath();
				range.moveTo(x, 10);
				range.lineTo(x + 12, 10);
				range.lineTo(x + 12, 4);
				range.closePath();
				range.fill();
			}
			if (sample.loop < sample.end && ptr === sample.loop) {
				range.beginPath();
				range.moveTo(x, 10);
				range.lineTo(x + 12, 10);
				range.lineTo(x, 4);
				range.closePath();
				range.fill();
			}
		}
	}

	if (update) {
		l = (sample.end === sample.loop);

		$('#txSampleName').val(sample.name);
		$('#scSampleLength').val('' + sample.end);
		$('#scSampleRepeat')
			.trigger('touchspin.updatesettings', { min: 0, max: sample.end })
			.val(sample.end - sample.loop);

		if (l && sample.releasable)
			sample.releasable = false;

		$('#chSampleRelease').prop('checked', sample.releasable);
		$('#chSampleRelease').prop('disabled', l).parent()[l ? 'addClass' : 'removeClass']('disabled');
	}
};
//---------------------------------------------------------------------------------------
/** Tracker.doc submodule */
//---------------------------------------------------------------------------------------
Tracker.prototype.doc = {
	// ajax cache for text documentations:
	txtCache: {},

	tooltip: {
		'miFileNew'       : 'New',
		'miFileOpen'      : 'Open [Ctrl+O]',
		'miFileSave'      : 'Save [Ctrl+S]',
		'miFileSaveAs'    : 'Save as...',
		'miEditCut'       : 'Cut [Ctrl+X]',
		'miEditCopy'      : 'Copy [Ctrl+C]',
		'miEditPaste'     : 'Paste [Ctrl+V]',
		'miEditClear'     : 'Clear [Ctrl+D]',
		'miEditUndo'      : 'Undo [Ctrl+Z]',
		'miEditRedo'      : 'Redo [Ctrl+Y | Ctrl+Shift+Z]',
		'miStop'          : 'Stop [Esc]',
		'miSongPlay'      : 'Play song [F5]',
		'miSongPlayStart' : 'Play song from start [F6]',
		'miPosPlay'       : 'Play position [F7]',
		'miPosPlayStart'  : 'Play position from start [F8]',
		'miToggleLoop'    : 'Toggle repeat [F11]',
		'miManager'       : 'Track manager [F9]',
		'miPreferences'   : 'Preferences [F10]',
		'miSpecialLogin'  : 'Login to SAA-1099\ncloud for musicians',
		'scOctave'        : 'Base octave [Ctrl+1...Ctrl+8]',
		'scAutoSmp'       : 'Auto-typed sample',
		'scAutoOrn'       : 'Auto-typed ornament',
		'scRowStep'       : 'Row-step in edit mode [- Ctrl+9 | Ctrl+0 +]',
		'btPatternCreate' : 'Create a new pattern\nin length of current',
		'btPatternDelete' : 'Delete the current pattern\n(and renumber others if it isn\'t last one)',
		'btPatternClean'  : 'Clear content of current pattern',
		'btPatternInfo'   : 'View summary dialog of patterns',
		'scPattern'       : 'Current pattern number',
		'scPatternLen'    : 'Current pattern length',
		'txPatternUsed'   : 'How many times is the pattern used',
		'txPatternTotal'  : 'Total number of patterns',
		'btPosCreate'     : 'Create an empty position\nat the end of song',
		'btPosInsert'     : 'Create a copy of current position\nand insert before it',
		'btPosDelete'     : 'Delete the current position',
		'btPosMoveUp'     : 'Move the current position\nbefore the previous',
		'btPosMoveDown'   : 'Move the current position\nafter the next one',
		'scPosCurrent'    : 'Actual position to play or edit [- Ctrl+Shift+Left|Right +]',
		'scPosLength'     : 'Current position length',
		'scPosSpeed'      : 'Initial speed of current position',
		'scPosRepeat'     : 'Position number to repeat from',
		'txPosTotal'      : 'Total number of positions',
		'scChnButton'     : 'Mute/Unmute channels [Ctrl+Num1...Ctrl+Num6]',
		'scChnPattern'    : 'Assigned pattern for specific\nchannel in current position',
		'scChnTrans'      : 'Transposition of notes\nin specific channel-pattern',
		'scSampleNumber'  : 'Current sample ID',
		'txSampleName'    : 'Current sample description',
		'scSampleTone'    : 'Base tone and octave\nto test this sample',
		'btSamplePlay'    : 'Play current sample',
		'btSampleStop'    : 'Stop playback [Esc]',
		'btSampleClear'   : 'Clear sample or\npart of sample data',
		'btSampleSwap'    : 'Swap volume data between channels',
		'btSampleLVolUp'  : 'Volume up left channel',
		'btSampleLVolDown': 'Volume down left channel',
		'btSampleCopyLR'  : 'Copy volume data from left to right channel',
		'btSampleCopyRL'  : 'Copy volume data from right to left channel',
		'btSampleRVolUp'  : 'Volume up right channel',
		'btSampleRVolDown': 'Volume down right channel',
		'btSampleRotL'    : 'Shift whole sample data\nto the left side',
		'btSampleRotR'    : 'Shift whole sample data\nto the right side',
		'btSampleEnable'  : 'Enable frequency generator\nin full active sample length',
		'btSampleDisable' : 'Disable frequency generator\nin full sample length',
		'chSampleRelease' : 'Sample can continue in playing\nafter the loop section when\nthe note was released in tracklist',
		'scSampleLength'  : 'Length of current sample',
		'scSampleRepeat'  : 'Number of ticks at the end\nof sample which will be repeated',
		'scOrnNumber'     : 'Current ornament ID',
		'txOrnName'       : 'Current ornament description',
		'scOrnTestSample' : 'Sample ID to test ornament with',
		'scOrnTone'       : 'Base tone and octave\nto test this ornament',
		'btOrnPlay'       : 'Play current ornament\nwith test sample',
		'btOrnStop'       : 'Stop playback [Esc]',
		'btOrnClear'      : 'Clear ornament',
		'btOrnShiftLeft'  : 'Shift whole ornament data\nto the left side',
		'btOrnShiftRight' : 'Shift whole ornament data\nto the right side',
		'btOrnTransUp'    : 'Transpose ornament data\nup a halftone',
		'btOrnTransDown'  : 'Transpose ornament data\ndown a halftone',
		'btOrnCompress'   : 'Compress ornament data\n(keep only every even line)',
		'btOrnExpand'     : 'Expand ornament data\n(duplicate each line)',
		'fxOrnChords'     : 'Replace current ornament with\npregenerated chord decomposition',
		'scOrnLength'     : 'Length of current ornament',
		'scOrnRepeat'     : 'Number of ticks at the end\nof ornament which will be repeated'
	},

	statusbar: [
		/*  0 */ "NOTE - use alphanumeric keys as two-octave piano, for RELEASE note use [A], [1] or [-] key",
		/*  1 */ "SAMPLE - [0] no change, [1 - V] to change current sample",
		/*  2 */ "ORNAMENT - [0] no change, [1 - F] for ornament, or [X] for release ornament",
		/*  3 */ "VOLUME CHANGE - [0] no change, [1 - F] for volume change in left channel",
		/*  4 */ "VOLUME CHANGE - [0] no change, [1 - F] for volume change in right channel",
		/*  5 */ "COMMAND - [0] no change, [1 - F] to use effect or command",
		/*  6 */ "COMMAND: 1XY - portamento up",
		/*  7 */ "COMMAND: 2XY - portamento down",
		/*  8 */ "COMMAND: 3XY - glissando to given note",
		/*  9 */ "COMMAND: 4XY - vibrato on current note",
		/* 10 */ "COMMAND: 5XY - tremolo on current note",
		/* 11 */ "COMMAND: 6XX - delay ornament",
		/* 12 */ "COMMAND: 7XX - ornament offset",
		/* 13 */ "COMMAND: 8XX - delay sample",
		/* 14 */ "COMMAND: 9XX - sample offset",
		/* 15 */ "COMMAND: AXY - volume slide",
		/* 16 */ "COMMAND: BXX - break current channel-pattern and loop from line",
		/* 17 */ "COMMAND: CXY - special command",
		/* 18 */ "COMMAND: DXX - delay listing on current line",
		/* 19 */ "COMMAND: EXY - soundchip envelope or noise channel control",
		/* 20 */ "COMMAND: FXX - change global speed",
		/* 21 */ "COMMAND 1st parameter: period of change (in ticks)",
		/* 22 */ "COMMAND 2nd parameter: pitch change in period (in cents)",
		/* 23 */ "COMMAND parameter: delay (in ticks)",
		/* 24 */ "COMMAND parameter: offset (in ticks)",
		/* 25 */ "COMMAND 2nd parameter: volume change in period [- 9-F | 1-7 +]",
		/* 26 */ "COMMAND parameter: trackline of current channel-pattern",
		/* 27 */ "COMMAND parameter: [00] disable last command, [XY] false-chord, [F1] swap stereo channels",
		/* 28 */ "COMMAND 1st parameter: [0, 1] enable envelope control, [D] disable, [2] enable noise control",
		/* 29 */ "COMMAND 2nd parameter: [0-F] for envelope shape, [0-4] for noise control",
		/* 30 */ "COMMAND parameter: speed of track listing (01-1F constant, otherwise XY for swing mode)",
		/* 31 */ "COMMAND parameter: none",
	],

	// helper functions for statusbar:
	lastStatus: void 0,
	setStatusText: function (i) {
		var text = this.statusbar[i];

		if (text && i === this.lastStatus)
			return;

		$('#statusbar>p').html(!text ? '' :
			(
				text.replace(/(\[.+?\])/g, '<strong>$1</strong>')
				    .replace(/^([\w ]+?)(\:| \-)/, '<kbd>$1</kbd>$2')
				    .replace(/(\(.+?\))$/, '<em>$1</em>')
			)
		);

		this.lastStatus = i;
	},

	showTracklistStatus: function (col, cmd) {
		var i = col;

		if (col === 5)
			i = cmd + 5;
		else if (col > 5) {
			switch (cmd) {
				case 0x1:
				case 0x2:
				case 0x3:
				case 0x4:
				case 0x5:
					i = (col + 15);
					break;
				case 0x6:
				case 0x8:
				case 0xD:
					i = 23;
					break;
				case 0x7:
				case 0x9:
					i = 24;
					break;
				case 0xA:
					i = (col == 6) ? 21 : 25;
					break;
				case 0xB:
					i = 26;
					break;
				case 0xC:
					i = 27;
					break;
				case 0xE:
					i = (col + 22);
					break;
				case 0xF:
					i = 30;
					break;
				default:
					i = 31;
					break;
			}
		}

		this.setStatusText(i);
	}
};
//---------------------------------------------------------------------------------------
/** Tracker.gui submodule - template loader and element populator with jQuery */
/* global dev, getCompatible, AudioDriver, SyncTimer, Player */
//---------------------------------------------------------------------------------------
Tracker.prototype.populateGUI = function () {
	var app = this;

	var tplInjectionTable = {
			'menu':        'nav.navbar',
			'header':     '.fixed-container',
			'trackedit':  '.fixed-container>.tab-content',
			'smpedit':    '.fixed-container>.tab-content',
			'ornedit':    '.fixed-container>.tab-content'
		};

	var populatedElementsTable = [
		{
			global:   'document',
			method:   'bind',
			param:    'contextmenu',
			handler:  function(e) {
				e.preventDefault();
				return false;
			}
		}, {
			global:   'window',
			method:   'resize',
			handler:  function() {
				var c = app.tracklist.countTracklines();
				if (c !== app.settings.tracklistLineHeight) {
					app.tracklist.setHeight(c);
					app.updateTracklist(true);

					var offset = $('#statusbar').offset();
					$('#documodal .modal-body').css('height', offset.top * 0.8);
				}
			}
		}, {
			global:   'window',
			method:   'bind',
			param:    'beforeunload',
			handler:  function() {
				if (!dev)
					return 'All unsaved changes in SAA1099Tracker will be lost.';
			}
		}, {
			global:   'window',
			method:   'bind',
			param:    'keyup keydown',
			handler:  function(e) { return app.handleKeyEvent(e.originalEvent) }
		}, {
			global:   'window',
			method:   'bind',
			param:    'blur',
			handler:  function(e) {
				var i, o = app.globalKeyState;
				for (i in o) if ((i - 0)) {
					delete o[i];
					o.length--;
				}
			}
		}, {
			selector: '[data-tooltip]',
			method:   'each',
			handler:  function(i, el) {
				var data = (el.dataset || $(this).data()).tooltip || '',
					id = data.length ? data : el.id || el.htmlFor || el.name,
					delay = /^mi/.test(id) ? 500 : 2000,
					t = app.doc.tooltip[id];

				if (!t)
					return;

				$(this).tooltip({
					html: true,
					animation: false,
					delay: { "show": delay, "hide": 0 },
					placement: 'auto top',
					trigger: 'hover',
					title: t.replace(/\.{3}/g, '&hellip;')
					        .replace(/\n/g, '<br>')
					        .replace(/(\[.+?\])$/, '<kbd>$1</kbd>')
				});
			}
		}, {
			selector: 'canvas',
			method:   'each',
			handler:  function(i, el) {
				var name = el.className, o = app[name];

				if (name === 'tracklist') {
					o.obj = el;
					o.ctx = el.getContext('2d');
					getCompatible(o.ctx, 'imageSmoothingEnabled', true, false);
				}
				else if (name === 'smpornedit') {
					name = el.id.replace('smpedit_', '');

					o[name].obj = el;
					o[name].ctx = el.getContext('2d');
					getCompatible(o[name].ctx, 'imageSmoothingEnabled', true, false);
				}

				$(this).bind('mousedown mouseup mousemove dblclick mousewheel DOMMouseScroll', function (e) {
					var delta = e.originalEvent.wheelDelta || -e.originalEvent.deltaY || (e.originalEvent.type === 'DOMMouseScroll' && -e.originalEvent.detail);
					if (delta) {
						e.stopPropagation();
						e.preventDefault();

						e.delta = delta;
						e.type = 'mousewheel';
					}

					app.handleMouseEvent(name, o, e);
				});
			}
		}, {
			selector: 'img.pixelfont',
			method:   'load',
			handler:  function(e) { app.initPixelFont(e.target) }
		}, {
			selector: 'img.smpedit',
			method:   'load',
			handler:  function(e) { app.smpornedit.img = e.target }
		}, {
			selector: '#main-tabpanel a[data-toggle="tab"]',
			method:   'on',
			param:    'shown.bs.tab',
			handler:  function(e) { app.activeTab = parseInt($(this).data().value, 10) }
		}, {
			selector: '#scOctave',
			method:   'TouchSpin',
			data: {
				initval: '2',
				min: 1, max: 8
			}
		}, {
			selector: '#scOctave',
			method:   'change',
			handler:  function() { app.ctrlOctave = $(this).val() - 0 }
		}, {
			selector: '#scAutoSmp',
			method:   'TouchSpin',
			data: {
				initval: '0',
				radix: 32,
				min: 0, max: 31
			}
		}, {
			selector: '#scAutoSmp',
			method:   'change',
			handler:  function() { app.ctrlSample = parseInt($(this).val(), 32) }
		}, {
			selector: '#scAutoOrn',
			method:   'TouchSpin',
			data: {
				initval: '0',
				radix: 16,
				min: 0, max: 15
			}
		}, {
			selector: '#scAutoOrn',
			method:   'change',
			handler:  function() { app.ctrlOrnament = parseInt($(this).val(), 16) }
		}, {
			selector: '#scRowStep',
			method:   'TouchSpin',
			data: {
				initval: '0',
				min: 0, max: 8
			}
		}, {
			selector: '#scRowStep',
			method:   'change',
			handler:  function() { app.ctrlRowStep = $(this).val() - 0 }
		}, {
			selector: '#scPattern,#scPosCurrent,#scPosRepeat,input[id^="scChnPattern"]',
			method:   'TouchSpin',
			data: {
				initval: '0',
				min: 0, max: 0
			}
		}, {
			selector: '#scPatternLen,#scPosLength',
			method:   'TouchSpin',
			data: {
				initval: '64',
				min: 1, max: Player.maxPatternLen
			}
		}, {
			selector: '#scPattern',
			method:   'change',
			handler:  function() {
				if (app.player.pattern.length <= 1)
					return false;

				app.workingPattern = $(this).val() - 0;
				app.updatePanelPattern();
			}
		}, {
			selector: '#scPatternLen',
			method:   'change',
			handler:  function() {
				var pp = app.player.pattern[app.workingPattern];
				if (app.player.pattern.length <= 1)
					return false;
				else if (app.modePlay) {
					$(this).val(pp.end);
					return false;
				}

				pp.end = $(this).val() - 0;
				app.player.countPositionFrames();
				app.updatePanelPattern();
				app.updateTracklist();
				app.updatePanelInfo();
				app.file.modified = true;
			}
		}, {
			selector: '#scPosCurrent',
			method:   'change',
			handler:  function() {
				if (!app.player.position.length)
					return false;
				else if (app.modePlay) {
					$(this).val(app.player.currentPosition + 1);
					return false;
				}

				app.player.currentPosition = $(this).val() - 1;
				app.player.currentLine = 0;

				app.updatePanelInfo();
				app.updatePanelPosition();
				app.updateTracklist();
			}
		}, {
			selector: '#scPosLength',
			method:   'change',
			handler:  function() {
				var pp = app.player.currentPosition,
					pos = app.player.position[pp];

				if (!app.player.position.length)
					return false;
				else if (app.modePlay) {
					$(this).val(pos.length);
					return false;
				}

				pos.length = $(this).val() - 0;

				if (app.player.currentLine >= pos.length)
					app.player.currentLine = pos.length - 1;

				app.player.countPositionFrames(pp);
				app.updateTracklist();
				app.updatePanelInfo();
				app.file.modified = true;
			}
		}, {
			selector: '#scPosSpeed',
			method:   'TouchSpin',
			data: {
				initval: '6',
				min: 1, max: 31
			}
		}, {
			selector: '#scPosSpeed',
			method:   'change',
			handler:  function() {
				var pp = app.player.currentPosition,
					pos = app.player.position[pp];

				if (!app.player.position.length)
					return false;
				else if (app.modePlay) {
					$(this).val(pos.speed);
					return false;
				}

				pos.speed = $(this).val() - 0;

				app.player.countPositionFrames(pp);
				app.updateTracklist();
				app.updatePanelInfo();
				app.file.modified = true;
			}
		}, {
			selector: '#scPosRepeat',
			method:   'change',
			handler:  function() {
				if (!app.player.position.length)
					return false;
				else if (app.modePlay) {
					$(this).val(app.player.repeatPosition + 1);
					return false;
				}
				else
					app.player.repeatPosition = $(this).val() - 1;

				app.file.modified = true;
			}
		}, {
			selector: 'input[id^="scChnPattern"]',
			method:   'change',
			handler:  function(e) {
				var el = e.target,
					pp = app.player.currentPosition,
					chn = el.id.substr(-1) - 1,
					pos = app.player.position[pp] || app.player.nullPosition,
					val = el.value - 0,
					prev = pos.ch[chn].pattern;

				if (!app.player.position.length)
					return false;
				else if (app.modePlay) {
					el.value = prev;
					return false;
				}

				pos.ch[chn].pattern = val;

				if (app.workingPattern === val || app.workingPattern === prev)
					app.updatePanelPattern();

				app.player.countPositionFrames(pp);
				app.updateTracklist();
				app.updatePanelInfo();
				app.file.modified = true;
			}
		}, {
			selector: 'input[id^="scChnTrans"]',
			method:   'each',
			handler:  function(i, el) {
				$(this).TouchSpin({
					initval: '0',
					min: -24, max: 24
				}).change(function(e) {
					var el = e.target,
						chn = el.id.substr(-1) - 1,
						pos = app.player.position[app.player.currentPosition];

					if (!app.player.position.length)
						return false;
					else if (app.modePlay) {
						el.value = pos.ch[chn].pitch;
						return false;
					}
					else
						pos.ch[chn].pitch = el.value - 0;

					app.file.modified = true;
				});
			}
		}, {
			selector: 'input[id^="scChnButton"]',
			method:   'each',
			handler:  function(i, el) {
				var cc = el.id.substr(-1);
				$(this).bootstrapToggle({
					on: cc,
					off: cc,
					onstyle: 'default',
					offstyle: 'default',
					size: 'mini',
					width: 58
				}).change(function(e) {
					var el = e.target;
					app.player.SAA1099.mute((el.value - 1), !el.checked);
				});
			}
		}, {
			selector: '#scSampleNumber,#scOrnTestSample',
			method:   'TouchSpin',
			data: {
				initval: '1',
				radix: 32,
				min: 1, max: 31
			}
		}, {
			selector: '#scSampleNumber',
			method:   'change',
			handler:  function() {
				app.workingSample = parseInt($(this).val(), 32);
				app.workingOrnTestSample = app.workingSample;
				app.updateSampleEditor(true);
				app.smpornedit.updateSamplePitchShift();
				$('#sbSampleScroll').scrollLeft(0);
				$('#scOrnTestSample').val(app.workingOrnTestSample.toString(32).toUpperCase());
			}
		}, {
			selector: '#scOrnTestSample',
			method:   'change',
			handler:  function() { app.workingOrnTestSample = parseInt($(this).val(), 32) }
		}, {
			selector: '#scOrnNumber',
			method:   'TouchSpin',
			data: {
				initval: '1',
				radix: 16,
				min: 1, max: 15
			}
		}, {
			selector: '#scOrnNumber',
			method:   'change',
			handler:  function() {
				app.workingOrnament = parseInt($(this).val(), 16);
				app.smpornedit.updateOrnamentEditor(true);
			}
		}, {
			selector: '#txSampleName',
			method:   'change',
			handler:  function(e) {
				app.player.sample[app.workingSample].name = e.target.value;
				app.file.modified = true;
			}
		}, {
			selector: '#txOrnName',
			method:   'change',
			handler:  function(e) {
				app.player.ornament[app.workingOrnament].name = e.target.value;
				app.file.modified = true;
			}
		}, {
			selector: '#scSampleTone,#scOrnTone',
			method:   'each',
			handler:  function(i, el) {
				var cc = 'tx' + el.id.substr(2);
				$(this).TouchSpin({
					initval: app.workingSampleTone,
					min: 1, max: 96
				}).change(function(e) {
					var el = e.target, val = el.value - 0;
					app.workingSampleTone = val;
					$('#scSampleTone,#scOrnTone')
						.val(val.toString())
						.prev().val(app.player.tones[val].txt);
				}).wrapAll('<div id="' + cc + '"/>')
				  .removeAttr('style')
				  .prop('readonly', true)
				  .clone(false)
				  .removeAttr('id')
				  .insertBefore(this);

				$(this).trigger('change');
			}
		}, {
			selector: '#sbSampleScroll',
			method:   'scroll',
			handler:  function(e) {
				app.smpornedit.smpeditScroll = 0 | ((e.target.scrollLeft/ 1000) * 64);
				app.updateSampleEditor();
			}
		}, {
			selector: '#scSampleLength,#scSampleRepeat,#scOrnLength,#scOrnRepeat',
			method:   'TouchSpin',
			data: {
				initval: '0',
				min: 0, max: 255
			}
		}, {
			selector: '#chSampleRelease',
			method:   'change',
			handler:  function(e) {
				var sample = app.player.sample[app.workingSample];
				if (sample.end !== sample.loop)
					sample.releasable = e.target.checked;
				app.updateSampleEditor(true);
				app.file.modified = true;
			}
		}, {
			selector: '#scSampleLength',
			method:   'change',
			handler:  function(e) {
				var sample = app.player.sample[app.workingSample],
					offset = parseInt(e.target.value, 10) - sample.end,
					looper = (sample.loop += offset);

				sample.end += offset;
				sample.loop = ((sample.end - looper) < 0) ? 0 : looper;

				app.updateSampleEditor(true);
				app.file.modified = true;
			}
		}, {
			selector: '#scSampleRepeat',
			method:   'change',
			handler:  function(e) {
				var sample = app.player.sample[app.workingSample],
					value = parseInt(e.target.value, 10);

				sample.loop = sample.end - value;
				app.updateSampleEditor(true);
				app.file.modified = true;
			}
		}, {
			selector: '#fxOrnChords button',
			method:   'each',
			handler:  function() {
				var id = $(this).text(),
					chord = app.smpornedit.chords[id],
					seqtxt = JSON.stringify(chord.sequence, null, 1).replace(/^\[|\]$|\s+/g, '');

				$(this).tooltip({
					html: true,
					animation: false,
					trigger: 'hover',
					delay: { "show": 500, "hide": 0 },
					title: chord.name + '<kbd>{ ' + seqtxt + ' }</kbd>'
				}).click(function() {
					var orn = app.player.ornament[app.workingOrnament],
						i, l = chord.sequence.length;

					orn.data.fill(0);
					orn.name = chord.name;
					orn.loop = 0;
					orn.end  = l;

					for (i = 0; i < l; i++)
						orn.data[i] = chord.sequence[i];

					app.smpornedit.updateOrnamentEditor(true);
					app.file.modified = true;
				});
			}
		}, {
			selector: '#scOrnLength',
			method:   'change',
			handler:  function(e) {
				var orn = app.player.ornament[app.workingOrnament],
					offset = parseInt(e.target.value, 10) - orn.end,
					looper = (orn.loop += offset);

				orn.end += offset;
				orn.loop = ((orn.end - looper) < 0) ? 0 : looper;

				app.smpornedit.updateOrnamentEditor(true);
				app.file.modified = true;
			}
		}, {
			selector: '#scOrnRepeat',
			method:   'change',
			handler:  function(e) {
				var orn = app.player.ornament[app.workingOrnament],
					value = parseInt(e.target.value, 10);

				orn.loop = orn.end - value;
				app.smpornedit.updateOrnamentEditor(true);
				app.file.modified = true;
			}
		}, {
			selector: '#sample-tabpanel a[data-toggle="tab"]',
			method:   'on',
			param:    'show.bs.tab',
			handler:  function(e) {
				if (e.target.id === 'tab-pitchshift' && e.relatedTarget.id === 'tab-sampledata')
					app.smpornedit.updateSamplePitchShift();
			}
		}, {
			selector: 'a[id^="miFileImportDemo"]',
			method:   'click',
			handler:  function() {
				var fn = $(this).data().filename;
				if (!fn || app.modePlay || app.globalKeyState.lastPlayMode)
					return false;
				app.file.loadDemosong(fn);
			}
		}, {
			selector: 'a[id^="miHelp"]',
			method:   'click',
			handler:  function() {
				var el = $(this),
					fn = el.data().filename;
				if (!fn)
					return false;
				app.onCmdShowDocumentation(fn);
			}
		}, {
			selector: '#miFileNew',
			method:   'click',
			handler:  function() { app.onCmdFileNew() }
		}, {
			selector: '#miFileOpen',
			method:   'click',
			handler:  function() { app.onCmdFileOpen() }
		}, {
			selector: '#miFileSave',
			method:   'click',
			handler:  function() { app.onCmdFileSave() }
		}, {
			selector: '#miFileSaveAs',
			method:   'click',
			handler:  function() { app.onCmdFileSave(true) }
		}, {
			selector: '#miAbout',
			method:   'click',
			handler:  function() { app.onCmdAbout() }
		}, {
			selector: '#miStop',
			method:   'click',
			handler:  function() { app.onCmdStop() }
		}, {
			selector: '#miSongPlay',
			method:   'click',
			handler:  function() { app.onCmdSongPlay() }
		}, {
			selector: '#miSongPlayStart',
			method:   'click',
			handler:  function() { app.onCmdSongPlayStart() }
		}, {
			selector: '#miPosPlay',
			method:   'click',
			handler:  function() { app.onCmdPosPlay() }
		}, {
			selector: '#miPosPlayStart',
			method:   'click',
			handler:  function() { app.onCmdPosPlayStart() }
		}, {
			selector: '#miToggleLoop',
			method:   'click',
			handler:  function() { app.onCmdToggleLoop() }
		}, {
			selector: 'button[id^="btPattern"]',
			method:   'click',
			handler:  function() { app[this.id.replace('btPattern', 'onCmdPat')]() }
		}, {
			selector: 'button[id^=btPos]',
			method:   'click',
			handler:  function() { app[this.id.replace('bt', 'onCmd')]() }
		}, {
			selector: 'button[id^="btSample"]',
			method:   'click',
			handler:  function() {
				var name = this.id.replace('btSample', 'onCmdSmp');
				if (name.endsWith('Stop'))
					name = name.replace('Smp', '');
				app[name]();
			}
		}, {
			selector: 'button[id^="btOrn"]',
			method:   'click',
			handler:  function() {
				var name = this.id.replace('btOrn', 'onCmdOrn');
				if (name.endsWith('Stop'))
					name = name.replace('Orn', '');
				app[name]();
			}
		}
	];

//---------------------------------------------------------------------------------------
	console.log('Tracker.gui', 'Loading HTML templates...');

	$.ajax({
		cache: true,
		contentType: false,
		converters: { "text html": jQuery.parseHTML },
		dataType: 'html',
		isLocal: true,
		url: location.appPath + 'Tracker.tpl.html',

		success: function (templates) {
			var i, l, o, data, selector;

			for (i = 0, l = templates.length; i < l; i++) {
				o = templates[i];
				console.log('Tracker.gui', 'Injecting "%s" template...', o.id);

				selector = tplInjectionTable[o.id] || 'body';
				$(o).contents().appendTo(selector);
			}

			console.log('Tracker.gui', 'Populating elements...');

			for (i = 0, l = populatedElementsTable.length; i < l; i++) {
				o = populatedElementsTable[i];
				data = o.handler || o.data;
				selector = o.selector || (o.global && window[o.global]);

				if (selector && o.method) {
					if (o.param)
						$(selector)[o.method](o.param, data);
					else
						$(selector)[o.method](data);
				}
			}
		}
	});
};
//---------------------------------------------------------------------------------------
Tracker.prototype.initializeGUI = function () {
	var app = this, i = 0;

	var initSteps = [
		function () {
			if (app.smpornedit.initialized || !app.smpornedit.img || app.activeTab === 1)
				return false;

			console.log('Tracker.gui', 'Force initialization of Sample/Ornament editors...');
			$('#tab-smpedit').tab('show');
			return true;
		},
		function () {
			if (app.smpornedit.initialized || !app.smpornedit.img || app.activeTab !== 1)
				return false;

			app.smpornedit.init();
			$('#tab-ornedit').tab('show');
			return true;
		},
		function () {
			if (app.tracklist.initialized || !app.pixelfont.ctx || app.activeTab === 0)
				return false;

			console.log('Tracker.gui', 'Force initialization of Tracklist editor by triggering of window resize event...');
			$('#tab-tracker').tab('show');
			$(window).trigger('resize');
			return true;
		},
		function () {
			if (app.tracklist.initialized || !app.pixelfont.ctx || app.activeTab)
				return false;

			console.log('Tracker.gui', 'Redrawing all tracklist elements and canvas...');
			app.updatePanels();
			app.updateTracklist(true);
			app.tracklist.initialized = true;
			return true;
		},
		function () {
			if (app.loaded)
				return false;

			console.log('Tracker.gui', 'Starting audio playback and initializing 50Hz refresh timer...');
			AudioDriver.play();
			SyncTimer.start(function() { app.baseTimer() }, 20);
			return true;
		},
		function () {
			if (app.loaded)
				return false;

			console.log('Tracker.gui', 'Initialization done, everything is ready!');
			document.body.className = '';
			return (app.loaded = true);
		}
	];

	var initFn = function () {
		var fn = initSteps[i];
		if (!!fn) {
			if (fn())
				i++;
			setTimeout(initFn, 250);
		}
	};

	initFn();
};
//---------------------------------------------------------------------------------------
