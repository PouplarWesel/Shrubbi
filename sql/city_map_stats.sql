-- Adds light-weight geometry fields for cities so the app can render per-city overlays on Mapbox.
-- These are approximate envelopes for visualization, not legal/administrative boundaries.

alter table public.cities
  add column if not exists center_lat double precision,
  add column if not exists center_lon double precision,
  add column if not exists bbox_sw_lat double precision,
  add column if not exists bbox_sw_lon double precision,
  add column if not exists bbox_ne_lat double precision,
  add column if not exists bbox_ne_lon double precision;
-- 70 city geo updates generated from tmp_city_venues.json + tmp_cities.json
update public.cities set
  center_lat = 33.8170526,
  center_lon = -117.8885897,
  bbox_sw_lat = 33.7407372,
  bbox_sw_lon = -117.9582476,
  bbox_ne_lat = 33.8978813,
  bbox_ne_lon = -117.8096111
where lower(name) = lower('Anaheim')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.9861942,
  center_lon = -121.7892569,
  bbox_sw_lat = 37.8906739,
  bbox_sw_lon = -121.8772330,
  bbox_ne_lat = 38.0751989,
  bbox_ne_lon = -121.7023868
where lower(name) = lower('Antioch')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 35.3641528,
  center_lon = -119.1422802,
  bbox_sw_lat = 35.2665754,
  bbox_sw_lon = -119.2575664,
  bbox_ne_lat = 35.4699025,
  bbox_ne_lon = -119.0577886
where lower(name) = lower('Bakersfield')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.8542941,
  center_lon = -122.2696657,
  bbox_sw_lat = 37.7874015,
  bbox_sw_lon = -122.3593119,
  bbox_ne_lat = 37.9179939,
  bbox_ne_lon = -122.1914578
where lower(name) = lower('Berkeley')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1783577,
  center_lon = -118.3223047,
  bbox_sw_lat = 34.0992076,
  bbox_sw_lon = -118.3978832,
  bbox_ne_lat = 34.2623503,
  bbox_ne_lon = -118.2461883
where lower(name) = lower('Burbank')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.1414618,
  center_lon = -117.3037473,
  bbox_sw_lat = 33.0546742,
  bbox_sw_lon = -117.4146425,
  bbox_ne_lat = 33.2319056,
  bbox_ne_lon = -117.2029984
where lower(name) = lower('Carlsbad')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 32.6336968,
  center_lon = -116.9963622,
  bbox_sw_lat = 32.5531087,
  bbox_sw_lon = -117.1599625,
  bbox_ne_lat = 32.7068561,
  bbox_ne_lon = -116.8934647
where lower(name) = lower('Chula Vista')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 36.8344167,
  center_lon = -119.6804231,
  bbox_sw_lat = 36.7359585,
  bbox_sw_lon = -119.7780502,
  bbox_ne_lat = 36.9206563,
  bbox_ne_lon = -119.5859990
where lower(name) = lower('Clovis')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.9821141,
  center_lon = -121.9960766,
  bbox_sw_lat = 37.9008605,
  bbox_sw_lon = -122.0893751,
  bbox_ne_lat = 38.0675939,
  bbox_ne_lon = -121.9009723
where lower(name) = lower('Concord')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.8823456,
  center_lon = -117.5910248,
  bbox_sw_lat = 33.7971117,
  bbox_sw_lon = -117.6661828,
  bbox_ne_lat = 33.9646088,
  bbox_ne_lon = -117.5174341
where lower(name) = lower('Corona')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.6734055,
  center_lon = -117.9120934,
  bbox_sw_lat = 33.5958008,
  bbox_sw_lon = -117.9990136,
  bbox_ne_lat = 33.7490253,
  bbox_ne_lon = -117.8222258
where lower(name) = lower('Costa Mesa')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.9452650,
  center_lon = -118.1346901,
  bbox_sw_lat = 33.8596983,
  bbox_sw_lon = -118.2143868,
  bbox_ne_lat = 34.0277996,
  bbox_ne_lon = -118.0599179
where lower(name) = lower('Downey')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.0792390,
  center_lon = -118.0317006,
  bbox_sw_lat = 34.0055735,
  bbox_sw_lon = -118.1076976,
  bbox_ne_lat = 34.1544926,
  bbox_ne_lon = -117.9595449
where lower(name) = lower('El Monte')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 38.4026990,
  center_lon = -121.3832316,
  bbox_sw_lat = 38.3166023,
  bbox_sw_lon = -121.4902946,
  bbox_ne_lat = 38.5065563,
  bbox_ne_lon = -121.2987710
where lower(name) = lower('Elk Grove')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.1510113,
  center_lon = -117.0697774,
  bbox_sw_lat = 33.0258719,
  bbox_sw_lon = -117.1517309,
  bbox_ne_lat = 33.2455700,
  bbox_ne_lon = -116.9866974
where lower(name) = lower('Escondido')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 38.2339032,
  center_lon = -122.0675098,
  bbox_sw_lat = 38.1175874,
  bbox_sw_lon = -122.2013955,
  bbox_ne_lat = 38.3195090,
  bbox_ne_lon = -121.9632518
where lower(name) = lower('Fairfield')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1241730,
  center_lon = -117.4455948,
  bbox_sw_lat = 34.0516304,
  bbox_sw_lon = -117.5213227,
  bbox_ne_lat = 34.1932360,
  bbox_ne_lon = -117.3705796
where lower(name) = lower('Fontana')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.5644779,
  center_lon = -122.0181158,
  bbox_sw_lat = 37.4911606,
  bbox_sw_lon = -122.1080177,
  bbox_ne_lat = 37.6366019,
  bbox_ne_lon = -121.9178558
where lower(name) = lower('Fremont')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 36.7887678,
  center_lon = -119.7259452,
  bbox_sw_lat = 36.6841057,
  bbox_sw_lon = -119.8151443,
  bbox_ne_lat = 36.9058843,
  bbox_ne_lon = -119.6277005
where lower(name) = lower('Fresno')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.8769661,
  center_lon = -117.9189457,
  bbox_sw_lat = 33.8094997,
  bbox_sw_lon = -118.0147505,
  bbox_ne_lat = 33.9436158,
  bbox_ne_lon = -117.8346894
where lower(name) = lower('Fullerton')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.7804854,
  center_lon = -117.9683426,
  bbox_sw_lat = 33.7048336,
  bbox_sw_lon = -118.0693526,
  bbox_ne_lat = 33.8497470,
  bbox_ne_lon = -117.8779769
where lower(name) = lower('Garden Grove')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1720175,
  center_lon = -118.2331167,
  bbox_sw_lat = 34.0724169,
  bbox_sw_lon = -118.3119598,
  bbox_ne_lat = 34.2875749,
  bbox_ne_lon = -118.1565144
where lower(name) = lower('Glendale')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.6418725,
  center_lon = -122.0754100,
  bbox_sw_lat = 37.5507117,
  bbox_sw_lon = -122.1570435,
  bbox_ne_lat = 37.7325633,
  bbox_ne_lon = -121.9816832
where lower(name) = lower('Hayward')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.6724971,
  center_lon = -117.9932876,
  bbox_sw_lat = 33.6081000,
  bbox_sw_lon = -118.0738587,
  bbox_ne_lat = 33.7371337,
  bbox_ne_lon = -117.8855315
where lower(name) = lower('Huntington Beach')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.9491533,
  center_lon = -118.3390722,
  bbox_sw_lat = 33.8743610,
  bbox_sw_lon = -118.4285365,
  bbox_ne_lat = 34.0236611,
  bbox_ne_lon = -118.2621438
where lower(name) = lower('Inglewood')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.6772663,
  center_lon = -117.7897648,
  bbox_sw_lat = 33.5859362,
  bbox_sw_lon = -117.9027304,
  bbox_ne_lat = 33.7702274,
  bbox_ne_lon = -117.6885115
where lower(name) = lower('Irvine')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.7125559,
  center_lon = -118.1497503,
  bbox_sw_lat = 34.6405319,
  bbox_sw_lon = -118.2605274,
  bbox_ne_lat = 34.8024845,
  bbox_ne_lon = -118.0672947
where lower(name) = lower('Lancaster')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.8452697,
  center_lon = -118.1990756,
  bbox_sw_lat = 33.7357441,
  bbox_sw_lon = -118.2766560,
  bbox_ne_lat = 33.9441882,
  bbox_ne_lon = -118.1271354
where lower(name) = lower('Long Beach')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.6691422,
  center_lon = -121.0055444,
  bbox_sw_lat = 37.5809642,
  bbox_sw_lon = -121.0832732,
  bbox_ne_lat = 37.7531299,
  bbox_ne_lon = -120.9252116
where lower(name) = lower('Modesto')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.9111286,
  center_lon = -117.2451699,
  bbox_sw_lat = 33.8179720,
  bbox_sw_lon = -117.3273243,
  bbox_ne_lat = 33.9863685,
  bbox_ne_lon = -117.1586792
where lower(name) = lower('Moreno Valley')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.5842717,
  center_lon = -117.1727698,
  bbox_sw_lat = 33.5026781,
  bbox_sw_lon = -117.2436383,
  bbox_ne_lat = 33.6731231,
  bbox_ne_lon = -117.1004940
where lower(name) = lower('Murrieta')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.8973986,
  center_lon = -118.0919830,
  bbox_sw_lat = 33.8271888,
  bbox_sw_lon = -118.1637802,
  bbox_ne_lat = 33.9698377,
  bbox_ne_lon = -118.0123534
where lower(name) = lower('Norwalk')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.7777234,
  center_lon = -122.2085074,
  bbox_sw_lat = 37.6932413,
  bbox_sw_lon = -122.3325227,
  bbox_ne_lat = 37.8748133,
  bbox_ne_lon = -122.1112116
where lower(name) = lower('Oakland')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.2160728,
  center_lon = -117.3249327,
  bbox_sw_lat = 33.1162889,
  bbox_sw_lon = -117.4313083,
  bbox_ne_lat = 33.3022573,
  bbox_ne_lon = -117.2178139
where lower(name) = lower('Oceanside')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.0554431,
  center_lon = -117.6271808,
  bbox_sw_lat = 33.9419734,
  bbox_sw_lon = -117.7337180,
  bbox_ne_lat = 34.1475655,
  bbox_ne_lon = -117.5205573
where lower(name) = lower('Ontario')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.8125090,
  center_lon = -117.7990476,
  bbox_sw_lat = 33.7282638,
  bbox_sw_lon = -117.9171965,
  bbox_ne_lat = 33.8933913,
  bbox_ne_lon = -117.7012477
where lower(name) = lower('Orange')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1873998,
  center_lon = -119.1907061,
  bbox_sw_lat = 34.1093901,
  bbox_sw_lon = -119.2968930,
  bbox_ne_lat = 34.2798525,
  bbox_ne_lon = -119.1115218
where lower(name) = lower('Oxnard')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.5680314,
  center_lon = -118.0988767,
  bbox_sw_lat = 34.4836773,
  bbox_sw_lon = -118.1876099,
  bbox_ne_lat = 34.6530052,
  bbox_ne_lon = -118.0056810
where lower(name) = lower('Palmdale')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1361871,
  center_lon = -118.1492774,
  bbox_sw_lat = 34.0658414,
  bbox_sw_lon = -118.2417391,
  bbox_ne_lat = 34.2159461,
  bbox_ne_lon = -118.0670860
where lower(name) = lower('Pasadena')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.0479478,
  center_lon = -117.7676686,
  bbox_sw_lat = 33.9742783,
  bbox_sw_lon = -117.8629202,
  bbox_ne_lat = 34.1176705,
  bbox_ne_lon = -117.6792949
where lower(name) = lower('Pomona')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1263086,
  center_lon = -117.6045031,
  bbox_sw_lat = 34.0403116,
  bbox_sw_lon = -117.6738529,
  bbox_ne_lat = 34.1959392,
  bbox_ne_lon = -117.5274215
where lower(name) = lower('Rancho Cucamonga')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 40.5748665,
  center_lon = -122.3542528,
  bbox_sw_lat = 40.4945210,
  bbox_sw_lon = -122.4710832,
  bbox_ne_lat = 40.6559898,
  bbox_ne_lon = -122.2669946
where lower(name) = lower('Redding')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.9230204,
  center_lon = -122.3310199,
  bbox_sw_lat = 37.8354138,
  bbox_sw_lon = -122.4362827,
  bbox_ne_lat = 38.0132262,
  bbox_ne_lon = -122.2450125
where lower(name) = lower('Richmond')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.9728839,
  center_lon = -117.3669571,
  bbox_sw_lat = 33.8849806,
  bbox_sw_lon = -117.4540031,
  bbox_ne_lat = 34.0766920,
  bbox_ne_lon = -117.2888073
where lower(name) = lower('Riverside')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 38.7797354,
  center_lon = -121.3168674,
  bbox_sw_lat = 38.6926791,
  bbox_sw_lon = -121.4291508,
  bbox_ne_lat = 38.8529829,
  bbox_ne_lon = -121.2199502
where lower(name) = lower('Roseville')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 38.5758087,
  center_lon = -121.4837771,
  bbox_sw_lat = 38.4565735,
  bbox_sw_lon = -121.5513441,
  bbox_ne_lat = 38.6754621,
  bbox_ne_lon = -121.4160770
where lower(name) = lower('Sacramento')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 36.6823079,
  center_lon = -121.6385821,
  bbox_sw_lat = 36.6163512,
  bbox_sw_lon = -121.7263531,
  bbox_ne_lat = 36.7522515,
  bbox_ne_lon = -121.5443113
where lower(name) = lower('Salinas')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1450115,
  center_lon = -117.3093121,
  bbox_sw_lat = 34.0543183,
  bbox_sw_lon = -117.4289652,
  bbox_ne_lat = 34.2587484,
  bbox_ne_lon = -117.1854305
where lower(name) = lower('San Bernardino')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 32.7439519,
  center_lon = -117.1713836,
  bbox_sw_lat = 32.6299207,
  bbox_sw_lon = -117.3044382,
  bbox_ne_lat = 32.8554770,
  bbox_ne_lon = -117.0209540
where lower(name) = lower('San Diego')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.3687332,
  center_lon = -121.8701879,
  bbox_sw_lat = 37.2845767,
  bbox_sw_lon = -121.9499558,
  bbox_ne_lat = 37.4617884,
  bbox_ne_lon = -121.7757075
where lower(name) = lower('San Jose')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.5493398,
  center_lon = -122.3108960,
  bbox_sw_lat = 37.4704926,
  bbox_sw_lon = -122.3879206,
  bbox_ne_lat = 37.6291032,
  bbox_ne_lon = -122.2317218
where lower(name) = lower('San Mateo')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.7264686,
  center_lon = -117.8921810,
  bbox_sw_lat = 33.6420089,
  bbox_sw_lon = -117.9614264,
  bbox_ne_lat = 33.8066724,
  bbox_ne_lon = -117.8170734
where lower(name) = lower('Santa Ana')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.4251109,
  center_lon = -119.7094846,
  bbox_sw_lat = 34.3506770,
  bbox_sw_lon = -119.7944889,
  bbox_ne_lat = 34.4926294,
  bbox_ne_lon = -119.6319055
where lower(name) = lower('Santa Barbara')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.3773459,
  center_lon = -121.9625807,
  bbox_sw_lat = 37.2982237,
  bbox_sw_lon = -122.0335248,
  bbox_ne_lat = 37.4528337,
  bbox_ne_lon = -121.8964025
where lower(name) = lower('Santa Clara')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.4086109,
  center_lon = -118.5183572,
  bbox_sw_lat = 34.3265304,
  bbox_sw_lon = -118.6042330,
  bbox_ne_lat = 34.5013627,
  bbox_ne_lon = -118.3867755
where lower(name) = lower('Santa Clarita')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.9491645,
  center_lon = -120.4316067,
  bbox_sw_lat = 34.8766385,
  bbox_sw_lon = -120.5040229,
  bbox_ne_lat = 35.0213630,
  bbox_ne_lon = -120.3611068
where lower(name) = lower('Santa Maria')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.0117964,
  center_lon = -118.4622314,
  bbox_sw_lat = 33.9416794,
  bbox_sw_lon = -118.5466277,
  bbox_ne_lat = 34.0786085,
  bbox_ne_lon = -118.3859912
where lower(name) = lower('Santa Monica')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 38.4315664,
  center_lon = -122.7435009,
  bbox_sw_lat = 38.3545259,
  bbox_sw_lon = -122.8280390,
  bbox_ne_lat = 38.5092232,
  bbox_ne_lon = -122.6257793
where lower(name) = lower('Santa Rosa')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.2688680,
  center_lon = -118.7341432,
  bbox_sw_lat = 34.2032169,
  bbox_sw_lon = -118.8514435,
  bbox_ne_lat = 34.3338566,
  bbox_ne_lon = -118.6218171
where lower(name) = lower('Simi Valley')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 38.0081628,
  center_lon = -121.3015175,
  bbox_sw_lat = 37.9071854,
  bbox_sw_lon = -121.3752255,
  bbox_ne_lat = 38.0982975,
  bbox_ne_lon = -121.2110344
where lower(name) = lower('Stockton')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 37.3685900,
  center_lon = -122.0213747,
  bbox_sw_lat = 37.2847099,
  bbox_sw_lon = -122.1010570,
  bbox_ne_lat = 37.4436553,
  bbox_ne_lon = -121.9474065
where lower(name) = lower('Sunnyvale')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.5039505,
  center_lon = -117.0936360,
  bbox_sw_lat = 33.4318100,
  bbox_sw_lon = -117.1755544,
  bbox_ne_lat = 33.5821382,
  bbox_ne_lon = -117.0127768
where lower(name) = lower('Temecula')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.1786750,
  center_lon = -118.9053859,
  bbox_sw_lat = 34.0982454,
  bbox_sw_lon = -119.0112240,
  bbox_ne_lat = 34.2578746,
  bbox_ne_lon = -118.7827223
where lower(name) = lower('Thousand Oaks')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 33.8260546,
  center_lon = -118.3419977,
  bbox_sw_lat = 33.7243266,
  bbox_sw_lon = -118.4245603,
  bbox_ne_lat = 33.9201883,
  bbox_ne_lon = -118.2638562
where lower(name) = lower('Torrance')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 38.1177886,
  center_lon = -122.2389781,
  bbox_sw_lat = 38.0369711,
  bbox_sw_lon = -122.3304241,
  bbox_ne_lat = 38.2191836,
  bbox_ne_lon = -122.1198707
where lower(name) = lower('Vallejo')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.2784511,
  center_lon = -119.2606281,
  bbox_sw_lat = 34.2001450,
  bbox_sw_lon = -119.3588040,
  bbox_ne_lat = 34.3513017,
  bbox_ne_lon = -119.1658820
where lower(name) = lower('Ventura')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.5410887,
  center_lon = -117.3321342,
  bbox_sw_lat = 34.4625315,
  bbox_sw_lon = -117.4279826,
  bbox_ne_lat = 34.6374248,
  bbox_ne_lon = -117.2366681
where lower(name) = lower('Victorville')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 36.3185498,
  center_lon = -119.2947056,
  bbox_sw_lat = 36.2426976,
  bbox_sw_lon = -119.3942474,
  bbox_ne_lat = 36.4181362,
  bbox_ne_lon = -119.2082505
where lower(name) = lower('Visalia')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 34.0584572,
  center_lon = -117.9193547,
  bbox_sw_lat = 33.9800918,
  bbox_sw_lon = -118.0071333,
  bbox_ne_lat = 34.1450892,
  bbox_ne_lon = -117.8420487
where lower(name) = lower('West Covina')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');

update public.cities set
  center_lat = 39.1373391,
  center_lon = -121.6244481,
  bbox_sw_lat = 39.0465593,
  bbox_sw_lon = -121.6980396,
  bbox_ne_lat = 39.2153072,
  bbox_ne_lon = -121.5546878
where lower(name) = lower('Yuba City')
  and lower(coalesce(state, '')) = lower('California')
  and upper(country_code) = upper('US');
-- Per-city aggregates for Mapbox overlays.
-- NOTE: This view intentionally aggregates across all users. Keep it aggregate-only.
create or replace view public.city_map_stats as
with city_members as (
  select
    p.city_id,
    count(distinct p.id) as member_count
  from public.profiles as p
  where p.city_id is not null
  group by p.city_id
),
city_plants as (
  select
    p.city_id,
    coalesce(sum(up.quantity), 0)::bigint as total_plants,
    (
      coalesce(
        sum(
          (
            (
              coalesce(up.co2_kg_per_year_override, pl.default_co2_kg_per_year, 0::numeric)
              * (greatest((current_date - up.planted_on), 0))::numeric
            )
            / 365.0
          )
          * (up.quantity)::numeric
        ),
        0::numeric
      )
    )::numeric(14,4) as total_co2_removed_kg
  from public.user_plants as up
  join public.profiles as p on p.id = up.user_id
  left join public.plants as pl on pl.id = up.plant_id
  where p.city_id is not null
  group by p.city_id
),
city_type_counts as (
  select
    p.city_id,
    pl.type as plant_type,
    sum(up.quantity)::bigint as plant_count
  from public.user_plants as up
  join public.profiles as p on p.id = up.user_id
  join public.plants as pl on pl.id = up.plant_id
  where p.city_id is not null
  group by p.city_id, pl.type
),
city_type_agg as (
  select
    city_id,
    jsonb_object_agg(plant_type, plant_count order by plant_count desc) as type_breakdown,
    (array_agg(plant_type order by plant_count desc))[1] as best_plant_type,
    (array_agg(plant_count order by plant_count desc))[1] as best_plant_type_count
  from city_type_counts
  group by city_id
)
select
  c.id as city_id,
  c.name as city_name,
  c.state as city_state,
  c.country as city_country,
  c.country_code,
  c.center_lat,
  c.center_lon,
  c.bbox_sw_lat,
  c.bbox_sw_lon,
  c.bbox_ne_lat,
  c.bbox_ne_lon,
  c.boundary_geojson,
  coalesce(cm.member_count, 0)::bigint as member_count,
  coalesce(cp.total_plants, 0)::bigint as total_plants,
  coalesce(cp.total_co2_removed_kg, 0::numeric)::numeric(14,4) as total_co2_removed_kg,
  cta.best_plant_type,
  cta.best_plant_type_count,
  coalesce(cta.type_breakdown, '{}'::jsonb) as type_breakdown
from public.cities as c
left join city_members as cm on cm.city_id = c.id
left join city_plants as cp on cp.city_id = c.id
left join city_type_agg as cta on cta.city_id = c.id;

alter view public.city_map_stats set (security_invoker = false);
alter view public.city_map_stats owner to postgres;

grant select on public.city_map_stats to authenticated;
grant all on public.city_map_stats to service_role;

-- Optional: force PostgREST to reload schema immediately (Supabase).
notify pgrst, 'reload schema';
