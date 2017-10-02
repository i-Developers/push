const vscode = require('vscode');

const ServiceSettings = require('./lib/ServiceSettings');
const Service = require('./lib/Service');
const Paths = require('./lib/Paths');
const Queue = require('./lib/Queue');
const utils = require('./lib/utils');

/**
 * Provides a normalised interface for the command panel and contextual menus.
 */
class Push {
	constructor() {
		this.upload = this.upload.bind(this);
		this.download = this.download.bind(this);
		this.setConfig = this.setConfig.bind(this);
		this.execUploadQueue = this.execUploadQueue.bind(this);
		this.didSaveTextDocument = this.didSaveTextDocument.bind(this);

		this.settings = new ServiceSettings();
		this.service = new Service();
		this.paths = new Paths();

		this.config = null;

		this.queues = {};

		// Set initial config
		this.setConfig();

		// Create event handlers
		vscode.workspace.onDidChangeConfiguration(this.setConfig);
		vscode.workspace.onDidSaveTextDocument(this.didSaveTextDocument);
	}

	/**
	 * Sets the current configuration for the active workspace.
	 */
	setConfig() {
		let settingsGlob;

		this.config = Object.assign({}, vscode.workspace.getConfiguration(
			'njpPush',
			vscode.window.activeTextEditor &&
				vscode.window.activeTextEditor.document.uri
			));

		// Augment configuration with computed settings
		if (Array.isArray(this.config.ignoreGlobs)) {
			settingsGlob = `**/${this.config.settingsFilename}`;
			this.config.ignoreGlobs.push(settingsGlob);

			// Ensure glob list only contains unique values
			this.config.ignoreGlobs = utils.uniqArray(this.config.ignoreGlobs);

			console.log(this.config);
		}
	}

	/**
	 * Handle text document save events
	 * @param {textDocument} textDocument
	 */
	didSaveTextDocument(textDocument) {
		const settings = this.settings.getServerJSON(
				textDocument.uri,
				this.config.settingsFilename
		);

		if (settings) {
			// File being changed is a within a service context - queue for uploading
			this.queueForUpload(textDocument.uri);
		}
	}

	/**
	 * Adds the current service settings based on the contextual URI to the
	 * current configuration, then returns the configuration.
	 * @param {uri} uriContext
	 */
	configWithServiceSettings(uriContext) {
		const settings = this.settings.getServerJSON(
			uriContext,
			this.config.settingsFilename
		);

		// Make a duplicate to avoid changing the original config
		let newConfig = Object.assign({}, this.config);

		if (settings) {
			// Settings retrieved from JSON file within context
			newConfig.serviceName = settings.data.service;
			newConfig.serviceFilename = settings.file,
			newConfig.service = settings.data[newConfig.serviceName];
			newConfig.serviceSettingsHash = settings.hash;

			return newConfig;
		} else {
			// No settings for this context - show an error
			utils.showError(utils.strings.NO_SERVICE_FILE, this.config.settingsFilename);

			return false;
		}
	}

	getQueue(queueName) {
		if (!this.queues[queueName]) {
			this.queues[queueName] = new Queue();
		}

		return this.queues[queueName];
	}

	/**
	 * @param {array} tasks - Tasks to execute. Must contain the properties detailed below.
	 * @param {boolean} [runImmediately="false"] - Whether to run the tasks immediately.
	 * @description
	 * Queues a task for a service method after doing required up-front work.
	 *
	 * ### Task properties:
	 * - `method` (`string`): Method to run.
	 * - `uriContext` (`uri`): URI context for the method.
	 * - `args` (`array`): Array of arguments to send to the method.
	 */
	queue(tasks = [], runImmediately = false, queueName = Push.queueNames.default) {
		const queue = this.getQueue(queueName);

		// Add initial init to a new queue
		if (queue.tasks.length === 0) {
			queue.addTask(() => {
				return this.service.activeService &&
					this.service.activeService.init();
			});
		}

		tasks.forEach(({ method, actionTaken, uriContext, args, id }) => {
			// Add queue item with contextual config
			queue.addTask(() => {
				let config;

				if (uriContext) {
					// Add service settings to the current configuration
					config = this.configWithServiceSettings(uriContext);
				} else {
					throw new Error('No uriContext set from queue source.');
				}

				if (config) {
					console.log(`Running queue entry ${method}...`);

					// Execute the service method, returning any results and/or promises
					return this.service.exec(method, config, args);
				}
			}, actionTaken, id);
		});

		if (runImmediately) {
			return this.execQueue(queueName);
		}
	}

	/**
	 * Queues a single file to be uploaded within the deferred queue.
	 * @param {uri} uri - File Uri to queue
	 */
	queueForUpload(uri) {
		let remoteUri;

		uri = this.paths.getFileSrc(uri);

		if (this.service) {
			remoteUri = this.service.exec(
				'convertUriToRemote',
				this.configWithServiceSettings(uri),
				[uri]
			);

			return this.queue([{
				method: 'put',
				actionTaken: 'uploaded',
				uriContext: uri,
				args: [uri, remoteUri],
				id: remoteUri + this.paths.getNormalPath(uri)
			}], false, Push.queueNames.upload);
		}
	}

	execQueue(queueName) {
		return this.getQueue(queueName)
			.exec(this.service.getStateProgress)
				.catch((error) => {
					throw error;
				});
	}

	execUploadQueue() {
		return this.execQueue(Push.queueNames.upload);
	}

	/**
	 * Uploads a single file or directory by its Uri.
	 * @param {Uri} uri
	 */
	upload(uri) {
		return this.transfer(uri, 'put');
	}

	/**
	 * Downloads a single file or directory by its Uri.
	 * @param {Uri} uri
	 */
	download(uri) {
		return this.transfer(uri, 'get');
	}

	transfer(uri, method) {
		let ignoreGlobs = [], action, actionTaken;

		// Get Uri from file/selection, src from Uri
		uri = this.paths.getFileSrc(uri);

		if (method === 'put') {
			// Filter Uri(s) by the ignore globs when uploading
			ignoreGlobs = this.config.ignoreGlobs;
			action = 'upload';
			actionTaken = 'uploaded';
		} else {
			action = 'download';
			actionTaken = 'downloaded';
		}

		if (this.paths.isDirectory(uri)) {
			// Recursively fetch directory files and transfer each one
			return this.paths.getDirectoryContentsAsFiles(uri, ignoreGlobs)
				.then((files) => {
					let tasks = files.map((uri) => {
						uri = vscode.Uri.parse(uri);

						return {
							method,
							actionTaken,
							uriContext: uri,
							args: [
								uri,
								this.service.exec(
									'convertUriToRemote',
									this.configWithServiceSettings(uri),
									[uri]
								)
							]
						};
					});

					// Add to queue and return
					return this.queue(tasks, true);
				});
		} else {
			// Filter a single file by the ignore globs and transfer
			return this.paths.filterUriByGlobs(uri, ignoreGlobs)
				.then((filteredUri) => {
					if (filteredUri !== false) {
						// Add to queue and return
						return this.queue([{
							method,
							actionTaken,
							uriContext: filteredUri,
							args: [
								filteredUri,
								this.service.exec(
									'convertUriToRemote',
									this.configWithServiceSettings(filteredUri),
									[filteredUri]
								)
							]
						}], true);
					} else {
						// Only one file is being transfered so warn the user it ain't happening
						utils.showWarning(
							`Cannot ${action} file "${this.paths.getBaseName(uri)}" -` +
							` It matches one of the defined ignoreGlobs filters.`
						);
					}
				});
		}
	}
}

Push.queueNames = {
	default: 'default',
	upload: 'upload'
};

module.exports = Push;