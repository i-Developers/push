const vscode = require('vscode');

const configService = require('./config');
const i18n = require('../lang/i18n');
const { TRANSFER_TYPES } = require('../lib/constants');

class Channel {
	constructor(name) {
		this.channel = vscode.window.createOutputChannel(name);
	}

	/**
	 * Appends a basic line to the channel output.
	 * @see https://code.visualstudio.com/docs/extensionAPI/vscode-api#OutputChannel
	 */
	appendLine() {
		return this.channel.appendLine.apply(this.channel, arguments);
	}

	/**
	 * @param {TransferResult} result - TransferResult instance.
	 * @description
	 * Produces a channel line to update users on the status of a single file.
	 * used throughout processes like uploading/downloading, etc.
	 */
	appendTransferResult(result) {
		let icon = this.getTransferIcon(result.type);

		if (result.error) {
			return this.appendError(`${icon}! ${result.src} (${result.error.message})`);
		}

		if (result.status === true || result.status === false) {
			return this.appendLine(`${icon}${(result.status ? icon : '-')} ${result.src}`);
		}
	}

	/**
	 * Returns an "icon" given one of the TRANSFER_TYPES types.
	 * @param {number} type - One of the {@link TRANSFER_TYPES} types.
	 */
	getTransferIcon(type) {
		return Channel.transferTypesMap[type] || '';
	}

	/**
	 * Produces a line formatted as an error (and also shows the output window).
	 * @param {string} error - Error or string to show.
	 */
	appendError(error) {
		let message, config;

		if (error instanceof Error) {
			config = configService.get();
			message = error.message;

			if (config.debugMode && error.fileName && error.lineNumber) {
				message += ` (${error.fileName}:${error.lineNumber})`;
			}
		} else {
			message = error;
		}

		this.channel.show();

		return this.channel.appendLine(`⚠️ ${message}`);
	}

	/**
	 * @description
	 * Produces a line formatted as an error (and also shows the output window).
	 * Uses localisation.
	 * @param {string} error - Localised string key to show.
	 * @param {...mixed} $2 - Replacement arguments as needed.
	 */
	appendLocalisedError(error) {
		let message, config,
			placeHolders = [...arguments].slice(1);

		if (error instanceof Error) {
			config = config.get();
			message = i18n.t.apply(i18n, [error.message].concat(placeHolders));

			if (config.debugMode && error.fileName && error.lineNumber) {
				message += ` (${error.fileName}:${error.lineNumber})`;
			}
		} else {
			message = i18n.t.apply(i18n, [error].concat(placeHolders));
		}

		this.channel.show();

		return this.channel.appendLine(`⚠️ ${message}`);
	}

	/**
	 * Produces a line formatted as an informative note.
	 * @param {string} string - Information string to show.
	 */
	appendInfo(string) {
		return this.channel.appendLine(`ℹ️ ${string}`);
	}

	/**
	 * Produces a line formatted as an informative note. Uses localisation.
	 * @param {string} string - Localised string key to show.
	 * @param {...mixed} $2 - Replacement arguments as needed.
	 */
	appendLocalisedInfo(string) {
		return this.channel.appendLine(
			`ℹ️ ${i18n.t.apply(i18n, [string].concat([...arguments].slice(1)))}`
		);
	}

	show() {
		return this.channel.show.apply(this.channel, arguments);
	}

	hide() {
		return this.channel.hide.apply(this.channel, arguments);
	}

	clear() {
		return this.channel.clear.apply(this.channel, arguments);
	}
}

Channel.transferTypesMap = {
	[TRANSFER_TYPES.PUT]: '>',
	[TRANSFER_TYPES.GET]: '<'
};

module.exports = new Channel('Push');
