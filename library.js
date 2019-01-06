"use strict";
var User = module.parent.require("./user"),
  meta = module.parent.require("./meta"),
  db = module.parent.require("../src/database"),
  utils = module.parent.require("../public/src/utils"),
  passport = module.parent.require("passport"),
  winston = module.parent.require("winston"),
  passportOAuth = require("passport-oauth2"),
  InternalOAuthError = require("passport-oauth2").InternalOAuthError,
  async = module.parent.require("async");

var authenticationController = module.parent.require(
  "./controllers/authentication"
);

var constants = Object.freeze({
  name: "Battle.net",
  slug: "battlenet",
  icon: "fa-check-square",
  admin: {
    route: "/plugins/sso-battlenet"
  },
  scope: "wow.profile"
});

var BattleNet = {
  settings: undefined
};

var _getPassportOptions = function(key, secret, region, domain) {
  var options = {
    clientID: key,
    clientSecret: secret,
    callbackURL: domain + "/auth/" + constants.slug + "/callback"
  };
  if (region === "cn") {
    options.authorizationURL = "https://www.battlenet.com.cn/oauth/authorize";
    options.tokenURL = "https://www.battlenet.com.cn/oauth/token";
  } else {
    options.authorizationURL =
      "https://" + region + ".battle.net/oauth/authorize";
    options.tokenURL = "https://" + region + ".battle.net/oauth/token";
  }
  return options;
};

const oAuthUrl = (region, path) => {
  if (region === "cn") {
    return "https://www.battlenet.com.cn" + path;
  }
  return "https://" + region + ".battle.net" + path;
};

const apiUrl = (region, path) => {
  if (region === "cn") {
    return "https://gateway.battlenet.com.cn" + path;
  }
  return "https://" + region + ".api.blizzard.com" + path;
};

const userCharacterUrl = region => apiUrl(region, "/wow/user/characters");
const userInfoUrl = region => oAuthUrl(region, "/oauth/userinfo");

BattleNet.init = function(params, callback) {
  function render(req, res) {
    res.render("admin/plugins/sso-battlenet", {});
  }

  params.router.get(
    "/admin/plugins/sso-battlenet",
    params.middleware.admin.buildHeader,
    render
  );
  params.router.get("/api/admin/plugins/sso-battlenet", render);

  callback();
};

BattleNet.getSettings = function(callback) {
  if (BattleNet.settings) {
    return callback();
  }

  meta.settings.get("sso-battlenet", function(err, settings) {
    BattleNet.settings = settings;
    callback();
  });
};

BattleNet.getStrategy = function(strategies, callback) {
  if (!BattleNet.settings) {
    return BattleNet.getSettings(function() {
      BattleNet.getStrategy(strategies, callback);
    });
  }

  if (
    BattleNet.settings !== undefined &&
    BattleNet.settings.hasOwnProperty("key") &&
    BattleNet.settings.key &&
    BattleNet.settings.hasOwnProperty("secret") &&
    BattleNet.settings.secret &&
    BattleNet.settings.hasOwnProperty("region") &&
    BattleNet.settings.region &&
    BattleNet.settings.hasOwnProperty("domain") &&
    BattleNet.settings.domain
  ) {
    var opts = _getPassportOptions(
      BattleNet.settings.key,
      BattleNet.settings.secret,
      BattleNet.settings.region,
      BattleNet.settings.domain
    );

    passportOAuth.Strategy.prototype.userProfile = function(accessToken, done) {
      async.parallel(
        {
          profile: function(next) {
            this._oauth2.get(
              userInfoUrl(BattleNet.settings.region),
              accessToken,
              function(err, body, res) {
                if (err) {
                  return next(
                    new InternalOAuthError("failed to fetch user profile", err)
                  );
                }

                try {
                  var json = JSON.parse(body);
                  json.provider = constants.slug;
                  next(null, json);
                } catch (e) {
                  next(e);
                }
              }
            );
          }.bind(this),
          characters: function(next) {
            this._oauth2.get(
              userCharacterUrl(BattleNet.settings.region),
              accessToken,
              function(err, body, res) {
                if (err) {
                  return next(
                    new InternalOAuthError(
                      "failed to fetch user characters",
                      err
                    )
                  );
                }
                try {
                  var json = JSON.parse(body);
                  next(null, json);
                } catch (e) {
                  next(e);
                }
              }
            );
          }.bind(this)
        },
        (err, data) => {
          if (err) {
            return done(err);
          }
          done(null, {
            id: data.profile.id,
            battletag: data.profile.battletag,
            characters: data.characters.characters
          });
        }
      );
    };

    opts.passReqToCallback = true;

    var oAuth = new passportOAuth(opts, function(
      req,
      token,
      secret,
      profile,
      done
    ) {
      if (
        req.hasOwnProperty("user") &&
        req.user.hasOwnProperty("uid") &&
        req.user.uid > 0
      ) {
        // Save battlenet data for the user
        BattleNet.updateUserFields(req.user.uid, profile);
        return done(null, req.user);
      }
      BattleNet.login(profile, function(err, user) {
        if (err) {
          return done(err);
        }
        if (user.isNew) {
          // Require collection of email
          req.session.registration = req.session.registration || {};
          req.session.registration.uid = user.uid;
          req.session.registration.bnetId = profile.id;
          req.session.registration.battletag = profile.battletag;
          req.session.registration.characters = profile.characters;
        }

        authenticationController.onSuccessfulLogin(req, user.uid);
        done(null, user);
      });
    });

    oAuth._oauth2.useAuthorizationHeaderforGET(true);

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

BattleNet.getAssociation = function(data, callback) {
  db.getObjectField("user:" + data.uid, constants.slug + "Id", function(
    err,
    bnetId
  ) {
    if (err) {
      return callback(err, data);
    }

    if (bnetId) {
      data.associations.push({
        associated: true,
        name: constants.name,
        icon: constants.icon
      });
    } else {
      data.associations.push({
        associated: false,
        url: "/auth/" + constants.slug,
        name: constants.name,
        icon: constants.icon
      });
    }

    callback(null, data);
  });
};

BattleNet.login = function(profile, callback) {
  BattleNet.getUidByOAuthid(profile.id, function(err, uid) {
    if (err) {
      return callback(err);
    }

    if (uid !== null) {
      // Existing User
      callback(null, {
        uid: uid,
        isNew: false
      });
    } else {
      // New User
      User.create(
        {
          username: "battlenet-" + profile.id,
          email: ""
        },
        function(err, uid) {
          if (err) {
            return callback(err);
          }

          BattleNet.updateUserFields(uid, profile);
          callback(null, {
            uid: uid,
            isNew: true
          });
        }
      );
    }
  });
};

BattleNet.updateUserFields = function(uid, profile) {
  // Save provider-specific information to the user
  User.setUserField(uid, constants.slug + "Id", profile.id);
  User.setUserField(uid, "battletag", profile.battletag);
  User.setUserField(uid, "characters", JSON.stringify(profile.characters));
  db.setObjectField(constants.slug + "Id:uid", profile.id, uid);
};

BattleNet.getUidByOAuthid = function(oAuthid, callback) {
  db.getObjectField(constants.slug + "Id:uid", oAuthid, function(err, uid) {
    if (err) {
      return callback(err);
    }
    callback(null, uid);
  });
};

BattleNet.deleteUserData = function(uid, callback) {
  async.waterfall(
    [
      async.apply(User.getUserField, uid, constants.slug + "Id"),
      function(oAuthIdToDelete, next) {
        db.deleteObjectField(constants.slug + "Id:uid", oAuthIdToDelete, next);
      }
    ],
    function(err) {
      if (err) {
        winston.error(
          "[sso-oauth] Could not remove OAuthId data for uid " +
            uid +
            ". Error: " +
            err
        );
        return callback(err);
      }
      callback(null, uid);
    }
  );
};

BattleNet.addToAdminHeader = function(custom_header, callback) {
  custom_header.authentication.push({
    route: constants.admin.route,
    name: constants.name
  });
  callback(null, custom_header);
};

BattleNet.addInterstitial = (data, next) => {
  if (
    data.userData.hasOwnProperty("uid") &&
    data.userData.hasOwnProperty("bnetId")
  ) {
    data.interstitials.push({
      template: "partials/sso-blizzard/register.tpl",
      data: {
        battletag: data.userData.battletag,
        characters: data.userData.characters
      },
      callback: BattleNet.storeAdditionalData
    });
  }
  next(null, data);
};

const userIsValid = (data, next) => {
  async.parallel(
    {
      emailValid: next => {
        if (data.email) {
          next(
            !utils.isEmailValid(data.email)
              ? new Error("[[error:invalid-email]]")
              : null
          );
        } else {
          next();
        }
      },
      userNameValid: next => {
        async.waterfall(
          [
            next => {
              const userslug = utils.slugify(data.username);

              if (data.username.length < meta.config.minimumUsernameLength) {
                return next(new Error("[[error:username-too-short]]"));
              }

              if (data.username.length > meta.config.maximumUsernameLength) {
                return next(new Error("[[error:username-too-long]]"));
              }

              if (!utils.isUserNameValid(data.username) || !userslug) {
                return next(new Error("[[error:invalid-username]]"));
              }

              User.existsBySlug(userslug, next);
            },
            (exists, next) => {
              next(exists ? new Error("[[error:username-taken]]") : null);
            }
          ],
          next
        );
      },
      emailAvailable: next => {
        if (data.email) {
          User.email.available(data.email, (err, available) => {
            if (err) {
              return next(err);
            }
            next(!available ? new Error("[[error:email-taken]]") : null);
          });
        } else {
          next();
        }
      }
    },
    err => {
      next(err);
    }
  );
};

BattleNet.storeAdditionalData = (userData, data, next) => {
  if (!data.hasOwnProperty("username")) {
    next(new Error("Missing username."));
  } else if (!data.hasOwnProperty("email")) {
    next(new Error("Missing email."));
  }
  async.parallel(
    [
      next => {
        userIsValid(data, next);
      },
      next => {
        User.setUserField(userData.uid, "username", data.username, next);
      },
      next => {
        User.setUserField(userData.uid, "email", data.email, next);
      }
    ],
    next
  );
};
BattleNet.deleteUserData = function(data, next) {
  var uid = data.uid;

  async.waterfall(
    [
      async.apply(User.getUserField, uid, constants.slug + "Id"),
      (oAuthIdToDelete, next) => {
        db.deleteObjectField(constants.slug + "Id:uid", oAuthIdToDelete, next);
      }
    ],
    err => {
      if (err) {
        winston.error(
          "[sso-battle.net] Could not remove OAuthId data for uid " +
            uid +
            ". Error: " +
            err
        );
        return next(err);
      }
      next(null, uid);
    }
  );
};

module.exports = BattleNet;
