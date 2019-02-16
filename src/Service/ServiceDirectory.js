const ServiceType = require('./ServiceType');

// Service providers
const ProviderSFTP = require('./providers/ProviderSFTP');
const ProviderFile = require('./providers/ProviderFile');

/**
 * Provides a directory of available service providers, as well as some methods
 * for managing and listing information about the services.
 */
class ServiceDirectory {
	/**
	 * Produce a list of the services available, for use within a QuickPick dialog.
	 * @return {ServiceType[]} List of the services, including default settings payloads.
	 */
	getQuickPickList() {
		const options = [];

		let service, settingsPayload;

		for (service in ServiceDirectory.services) {
			settingsPayload = {
				'env': 'default',
				'default': {
					service
				}
			};

			settingsPayload.default.options = this.getServiceSchemaValues(service);

			options.push(new ServiceType(
				service,
				ServiceDirectory.services[service].description,
				ServiceDirectory.services[service].detail,
				settingsPayload,
				this.getServiceSchemaValues(service, 'required')
			));
		}

		return options;
	}

	/**
	 * Get the default settings for a service, extended from the base defaults
	 * @param {string} serviceName - Name of the service to retrieve defaults for.
	 */
	getServiceSchemaValues(serviceSchema, key = 'default') {
		const values = {};

		if (typeof serviceSchema === 'string') {
			serviceSchema = ServiceDirectory.services[serviceSchema].optionSchema;
		}

		// Get default values for each key from the options object
		serviceSchema.forEach((option) => {
			if (key === 'required' && option[key]) {
				// Getting required value
				values[option.name] = true;
			} else if (key !== 'required') {
				// Getting default values
				values[option.name] = option[key] || '';
			}

			if (
				option.fields &&
				(key !== 'required' || (key === 'required' && values[option[0]]))
			) {
				// Nested fields — recurse and collect further items.
				values[option.name] = this.getServiceSchemaValues(
					option.fields,
					key
				);
			}
		});

		return values;
	}

	getSchema(service) {
		return ServiceDirectory.services[service].optionSchema || {};
	}
}

/**
 * A list of the service providers available.
 */
ServiceDirectory.services = {
	SFTP: ProviderSFTP,
	File: ProviderFile
};

module.exports = ServiceDirectory;