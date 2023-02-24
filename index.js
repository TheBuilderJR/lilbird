/***
 * A TinyBird Helper Library to send analytics events
 */

/**
 * Object.assign() polyfill
 */
// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
if (typeof Object.assign !== 'function') {
    Object.defineProperty(Object, 'assign', {
        value: function assign(target, varArgs) {
            'use strict';
            if (target == null) {
                throw new TypeError('Cannot convert undefined or null to object');
            }

            var to = Object(target);

            for (var index = 1; index < arguments.length; index++) {
                var nextSource = arguments[index];

                if (nextSource != null) {
                    for (var nextKey in nextSource) {
                        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                            to[nextKey] = nextSource[nextKey];
                        }
                    }
                }
            }
            return to;
        },
        writable: true,
        configurable: true
    });
}

function __legacy_generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[x]/g, function (c) {
        var r = Math.floor(Math.random() * 16);
        return r.toString(16);
    });
}

function ___uuidv4() {
    // if (!window.crypto || !window.crypto.getRandomValues)
        return __legacy_generateUUID();

    // return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function (c) { return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16) });
}

// Anonymously tracks a device across sessions
function ___getUID() {
    if (window && typeof window === 'object' && window.document) {
        if (window.__lilbird_uuid) {
            return window.__lilbird_uuid;
        } else {
            try {
                window.__lilbird_uuid = localStorage.getItem('__lilbird_uuid');
                if (!window.__lilbird_uuid) {
                    window.__lilbird_uuid = ___uuidv4();
                    localStorage.setItem('__lilbird_uuid', window.__lilbird_uuid);
                }
                if (window.__lilbird_uuid) return window.__lilbird_uuid;
            } catch(e) { console.warn('Error accessing local storage.') }
        }
    }

    return null;
}

// Anonymously tracks a session
function ___getSessionID() {
    if (window && typeof window === 'object' && window.document) {
        if (window.__lilbird_session_id) {
            return window.__lilbird_session_id;
        } else {
            try {
                window.__lilbird_session_id = sessionStorage.getItem('__lilbird_session_id');
                if (!window.__lilbird_session_id) {
                    window.__lilbird_session_id = ___uuidv4();
                    sessionStorage.setItem('__lilbird_session_id', window.__lilbird_session_id);
                }
                if (window.__lilbird_session_id) return window.__lilbird_session_id;
            } catch(e) { console.warn('Error accessing session storage.') }
        }
    }

    return null;
}

var ___lilbird = {
    user: {},
    configuration: {},
    config: function (conf) {
        this.configuration = Object.assign(this.configuration, conf);
        if (this.configuration.DEBUG) console.log('TinyBird Configuration:', this.configuration);
    },
    init: function (conf) {
        this.configuration = Object.assign(this.configuration, conf);
        if (this.configuration.DEBUG) console.log('TinyBird Configuration:', this.configuration);
    },
    track: function (event_name, body) {
        var _debug = this.configuration.DEBUG;

        // Checks
        if (typeof event_name !== 'string') return console.warn('event_name must be of type: string');

        try { event_name = event_name.trim(); } catch(e){}

        if (!event_name) return console.warn('event_name is required by track function');

        if (!/^[A-Za-z0-9_-]*$/gi.test(event_name)) console.warn('event_name can only contain letters, numbers, -, and _');

        // Configuration attached to window globals
        if (window && typeof window === 'object' && window.document && window.TINYBIRD_CONFIGURATION) {
            this.configuration = Object.assign(this.configuration, window.TINYBIRD_CONFIGURATION);
        }

        if (!this.configuration.WRITE_KEY) console.warn('WRITE_KEY must be set via window.TINYBIRD_CONFIGURATION or init({ WRITE_KEY })');

        // Overwrite chain for properties to be sent to ClickHouse
        body = Object.assign({ ts: new Date().toISOString(), anonymous_device_id: ___getUID(), session_id: ___getSessionID() }, this.user, body);

        // Normalize all types in body for TinyBird type safety
        // All numbers should become strings
        for (var k in body) {
            if (typeof body[k] === 'number') body[k] = (body[k]).toString();
        }

        // Use DEFAULTS to perform a transformation on the body of the event
        // Enforces default values to avoid TinyBird errors
        if (this.configuration.DEFAULTS && typeof this.configuration.DEFAULTS === 'object') {
            var DEFAULTS = this.configuration.DEFAULTS;
            var global_defaults = DEFAULTS['*'] || {};
            var event_defaults = DEFAULTS[event_name] || {};
            var defaults_for_this_event = Object.assign(global_defaults, event_defaults);

            for (var key in defaults_for_this_event) {
                if (key && defaults_for_this_event.hasOwnProperty(key) && body[key] === undefined) {
                    body[key] = defaults_for_this_event[key];
                }
            }
        }

        // User-defined body transformation
        if (this.configuration.BODY_TRANSFORMATION && typeof this.configuration.BODY_TRANSFORMATION === 'function') {
            var body_transformed = this.configuration.BODY_TRANSFORMATION(body, event_name);
            if (body_transformed && typeof body_transformed === 'object') body = body_transformed;
            else console.warn('No event object returned from BODY_TRANSFORMATION');
        }

        if (_debug) console.log('TinyBird Event:', event_name, body);

        try {
            fetch((this.configuration.BASE_URL || 'https://api.tinybird.co/v0/events') + '?name=' + event_name, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: { Authorization: 'Bearer ' + this.configuration.WRITE_KEY }
            })
                .then(function (res) { return res.json() }).then(function (data) { if (_debug) console.log('Tinybird Event response', data) })
                .catch(function (e) { if (_debug) console.log(e) });

        } catch(e) {
            if (_debug) console.log('Failed to fetch');
        }
    },
    identify: function (uid, data) {
        if (typeof data === 'object') {
            try {
                this.user = Object.assign(data, this.user);
                this.user.uid = uid;
            } catch(e) {
                console.warn('Error calling identify function. Possible type mismatch.');
            }
        } else if (typeof uid === 'object' && !data) {
            // identify({}) convenience method
            try {
                this.user = Object.assign(uid, this.user);
            } catch(e) {
                console.warn('Error calling identify function. Possible type mismatch.');
            }
        }

        if (this.configuration.DEBUG) console.log('TinyBird Identify:', data || uid, this.user);
    },
};

try {
    if (window && typeof window === 'object' && window.document) {
        window.LILBIRD = ___lilbird;

        if (window.Analytics && typeof Analytics === 'function' && Analytics.track && Analytics.identify) {
            Analytics.addAdapter('lilbird', {
                enabled: true,
                test: function () { return !!window.LILBIRD },
                track: function (eventName, eventProperties) {
                    console.log('tracking', eventName, eventProperties);
                    LILBIRD.track(eventName, eventProperties);
                },
                identify: function (userId, userProperties) {
                    console.log('identifying', userId, userProperties);
                    LILBIRD.identify(userId, userProperties);
                },
            });
        }
    }
} catch(e){}

if (typeof module !== 'undefined') {
    module.exports = ___lilbird;
}
