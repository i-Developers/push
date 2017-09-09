const vscode = require('vscode');

class ServiceBase {
	constructor() {
		this.type = '';
		this.progress = null;
		this.serviceDefaults = {};
		this.config = {};
	}

	destructor() {
		this.config = null;
	}

	setConfig(config) {
		this.config = config;
	}

	mergeWithDefaults(settings) {
		return Object.assign({}, this.serviceDefaults, settings);
	}

	validateServiceSettings(spec, settings) {
		let key;

		for (key in spec) {
			if (spec.hasOwnProperty(key)) {
				if (!settings[key]) {
					this.showError(
						`Server setting file for type ${this.type} missing required setting: "${key}".` +
						` Please resolve before continuing.`
					);
					return false;
				}
			}
		}

		return true;
	}

	showError(error) {
		if (typeof error !== "string") {
			error = error.message;
		}

		vscode.window.showErrorMessage(`${this.type}: ${error}`);
	}

	/**
	 * Base service file upload method.
	 * @param {string} src - File source path
	 * @param {string} dest - File destination path
	 */
	put() {
		throw new Error('Service #put method is not yet defined.');
	}

	/**
	 * Base service file download method.
	 * @param {string} src - File source path
	 * @param {string} dest - File destination path
	 */
	get() {
		throw new Error('Service #get method is not yet defined.');
	}
};

module.exports = ServiceBase;