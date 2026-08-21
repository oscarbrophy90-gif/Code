/* VOID FISHING — weather.
   Weather is atmosphere first and a modifier second: nothing here should ever
   make the game feel worse to sit in. All effects are positive or neutral. */
(function (VF) {
  'use strict';

  const LIST = [
    { id: 'clear', name: 'Clear', weight: 100,
      blurb: 'Still air. Every star accounted for.',
      bite: 1.00, rare: 1.00, luck: 0.00, fog: 0, rain: 0, wind: 0.25, light: 1.00, tint: null },

    { id: 'overcast', name: 'Overcast', weight: 62,
      blurb: 'A ceiling you cannot see the top of.',
      bite: 1.04, rare: 1.02, luck: 0.02, fog: 0.25, rain: 0, wind: 0.4, light: 0.82, tint: '#5a6472' },

    { id: 'rain', name: 'Rain', weight: 52,
      blurb: 'Fish activity up. The surface will not stay still.',
      bite: 0.88, rare: 1.08, luck: 0.05, fog: 0.15, rain: 1, wind: 0.55, light: 0.76, tint: '#4a5a70' },

    { id: 'fog', name: 'Fog', weight: 44,
      blurb: 'Mysterious encounters far more likely.',
      bite: 1.02, rare: 1.30, luck: 0.10, fog: 1, rain: 0, wind: 0.15, light: 0.70, tint: '#6a7484', encounter: 2.1 },

    { id: 'storm', name: 'Storm', weight: 22,
      blurb: 'Big things move in weather like this.',
      bite: 0.84, rare: 1.55, luck: 0.16, fog: 0.35, rain: 1.6, wind: 1.0, light: 0.62, tint: '#3a4560', shake: 0.4, encounter: 1.4 },

    { id: 'meteor', name: 'Meteor Shower', weight: 14,
      blurb: 'Cosmic catches become possible.',
      bite: 0.94, rare: 2.10, luck: 0.34, fog: 0, rain: 0, wind: 0.3, light: 1.05, tint: '#8a7ad0', meteors: 1, encounter: 1.6 },

    { id: 'eclipse', name: 'Eclipse', weight: 7,
      blurb: 'Everything down there has come up to look.',
      bite: 0.90, rare: 2.90, luck: 0.55, fog: 0.3, rain: 0, wind: 0.1, light: 0.34, tint: '#2a1c3a', encounter: 2.4 },

    { id: 'aurora', name: 'Aurora', weight: 18,
      blurb: 'Colour across the whole sky. Rare fish surface to see it.',
      bite: 0.96, rare: 1.85, luck: 0.28, fog: 0.1, rain: 0, wind: 0.35, light: 0.95, tint: '#4ad0c0', aurora: 1, encounter: 1.3 },

    { id: 'voidsurge', name: 'Void Surge', weight: 5,
      blurb: 'The water is thinking about something.',
      bite: 0.92, rare: 4.20, luck: 0.90, fog: 0.55, rain: 0, wind: 0.6, light: 0.5, tint: '#6a3ad0', surge: 1, shake: 0.25, encounter: 3.0 }
  ];

  const BY_ID = VF.util.byId(LIST);

  VF.weatherData = {
    list: LIST,
    get: function (id) { return BY_ID[id] || BY_ID.clear; }
  };
})(window.VF = window.VF || {});
