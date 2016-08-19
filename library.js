(function (module) {
	"use strict";
	var User = module.parent.require("./user"),
		Groups = module.parent.require("./groups"),
		meta = module.parent.require("./meta"),
		db = module.parent.require("../src/database"),
		passport = module.parent.require("passport"),
		fs = module.parent.require("fs"),
		path = module.parent.require("path"),
		nconf = module.parent.require("nconf"),
		winston = module.parent.require("winston"),
		passportOAuth = require("passport-oauth2"),
		async = module.parent.require("async");

	var authenticationController = module.parent.require("./controllers/authentication");

	var constants = Object.freeze({
		"name": "Battle.net",
		"slug": "battlenet",
		"icon": "fa-check-square",
		"admin": {
			"route": "/plugins/sso-battlenet"
		}
	});

	var BattleNet = {
		settings: undefined
	};


	var _getPassportOptions = function (key, secret, region, domain) {
		var options = {
			clientID: key,
			clientSecret: secret,
			callbackURL: domain + "/auth/" + constants.slug + "/callback"
		};
		if (region === "cn") {
			options.authorizationURL = "https://www.battlenet.com.cn/oauth/authorize";
			options.tokenURL = "https://www.battlenet.com.cn/oauth/token";
		} else {
			options.authorizationURL = "https://" + region + ".battle.net/oauth/authorize";
			options.tokenURL = "https://" + region + ".battle.net/oauth/token";
		}
		return options;
	};

	var _getUserIdRoute = function (region) {
		if (region === "cn") {
			return "https://api.battlenet.com.cn/account/user";
		}
		return "https://" + region + ".api.battle.net/account/user";
	};

	BattleNet.init = function (params, callback) {
		function render(req, res) {
			res.render("admin/plugins/sso-battlenet", {});
		}

		params.router.get("/admin/plugins/sso-battlenet", params.middleware.admin.buildHeader, render);
		params.router.get("/api/admin/plugins/sso-battlenet", render);

		callback();

	};


	BattleNet.getSettings = function (callback) {
		if (BattleNet.settings) {
			return callback();
		}

		meta.settings.get("sso-battlenet", function (err, settings) {
			BattleNet.settings = settings;
			callback();
		});
	}

	BattleNet.getStrategy = function (strategies, callback) {
		if (!BattleNet.settings) {
			return BattleNet.getSettings(function () {
				BattleNet.getStrategy(strategies, callback);
			});
		}

		if (
			BattleNet.settings !== undefined
			&& BattleNet.settings.hasOwnProperty("key") && BattleNet.settings.key
			&& BattleNet.settings.hasOwnProperty("secret") && BattleNet.settings.secret
			&& BattleNet.settings.hasOwnProperty("region") && BattleNet.settings.region
			&& BattleNet.settings.hasOwnProperty("domain") && BattleNet.settings.domain
		) {
			var opts = _getPassportOptions(BattleNet.settings.key, BattleNet.settings.secret, BattleNet.settings.region, BattleNet.settings.domain);

			passportOAuth.Strategy.prototype.userProfile = function (accessToken, done) {
				this._oauth2.get(_getUserIdRoute(BattleNet.settings.region), accessToken, function (err, body, res) {
					if (err) { return done(new InternalOAuthError("failed to fetch user profile", err)); }

					try {
						var json = JSON.parse(body);
						json.provider = constants.slug;
						done(null, json);

					} catch (e) {
						done(e);
					}
				});
			};


			opts.passReqToCallback = true;

			var oAuth = new passportOAuth(opts, function (req, token, secret, profile, done) {
				if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
					// Save facebook-specific information to the user
					BattleNet.updateUserFields(req.user.uid, profile);
					return done(null, req.user);
				}
				BattleNet.login(profile, function (err, user) {
					if (err) {
						return done(err);
					}

					authenticationController.onSuccessfulLogin(req, user.uid);
					done(null, user);
				});
			});

			passport.use(constants.name, oAuth);

			strategies.push({
				name: constants.name,
				url: "/auth/" + constants.slug,
				callbackURL: "/auth/" + constants.slug + "/callback",
				icon: "fa-check-square",
				scope: (constants.scope || "").split(",")
			});
		}

		callback(null, strategies);
	};



	BattleNet.getAssociation = function (data, callback) {
		User.getUserField(data.uid, constants.slug + 'Id', function (err, fbId) {
			if (err) {
				return callback(err, data);
			}

			if (fbId) {
				data.associations.push({
					associated: true,
					name: constants.name,
					icon: constants.icon
				});
			} else {
				data.associations.push({
					associated: false,
					url: '/auth/' + constants.slug,
					name: constants.name,
					icon: constants.icon
				});
			}

			callback(null, data);
		})
	};

	BattleNet.login = function (profile, callback) {
		BattleNet.getUidByOAuthid(profile.id, function (err, uid) {
			if (err) {
				return callback(err);
			}

			if (uid !== null) {
				// Existing User
				callback(null, {
					uid: uid
				});
			} else {
				// New User
				User.create({
					username: "battlenet-" + profile.id,
					email: ""
				}, function (err, uid) {
					if (err) {
						return callback(err);
					}

					BattleNet.updateUserFields(uid, profile);
					callback(null, {
						uid: uid
					});
				});
			}
		});
	};

	BattleNet.updateUserFields = function (uid, profile) {
		// Save provider-specific information to the user
		User.setUserField(uid, constants.slug + "Id", profile.id);
		User.setUserField(uid, "battletag", profile.battletag)
		db.setObjectField(constants.slug + "Id:uid", profile.id, uid);
	};

	BattleNet.getUidByOAuthid = function (oAuthid, callback) {
		db.getObjectField(constants.slug + "Id:uid", oAuthid, function (err, uid) {
			if (err) {
				return callback(err);
			}
			callback(null, uid);
		});
	};


	BattleNet.deleteUserData = function (uid, callback) {
		async.waterfall([
			async.apply(User.getUserField, uid, constants.slug + "Id"),
			function (oAuthIdToDelete, next) {
				db.deleteObjectField(constants.slug + "Id:uid", oAuthIdToDelete, next);
			}
		], function (err) {
			if (err) {
				winston.error("[sso-oauth] Could not remove OAuthId data for uid " + uid + ". Error: " + err);
				return callback(err);
			}
			callback(null, uid);
		});
	};

	BattleNet.addToAdminHeader = function (custom_header, callback) {
		custom_header.authentication.push({
			"route": constants.admin.route,
			"name": constants.name
		});
		callback(null, custom_header);
	};



	module.exports = BattleNet;
} (module));