define('admin/plugins/sso-battlenet', ['settings'], function(Settings) {
	'use strict';
	/* globals $, app, socket, require */

	var ACP = {};

	ACP.init = function() {
		Settings.load('sso-battlenet', $('.sso-battlenet-settings'));

		$('#save').on('click', function() {
			Settings.save('sso-battlenet', $('.sso-battlenet-settings'), function() {
				app.alert({
					type: 'success',
					alert_id: 'sso-battlenet-saved',
					title: 'Settings Saved',
					message: 'Please reload your NodeBB to apply these settings',
					clickfn: function() {
						socket.emit('admin.reload');
					}
				});
			});
		});
	};

	return ACP;
});