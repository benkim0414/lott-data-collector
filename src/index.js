const admin = require('firebase-admin');
const axios = require('axios');
const {
  mapKeys,
  upperFirst,
  mapValues,
  isArray,
  map,
  isPlainObject,
  camelCase,
  set,
  unset,
} = require('lodash');
const moment = require('moment');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

axios.defaults.baseURL = 'https://data.api.thelott.com';
axios.defaults.headers.post['Content-Type'] = 'application/json';

const SEARCH_REQUEST_URL
    = '/sales/vmax/web/data/lotto/results/search/daterange';

const COMPANY_TATTERSALLS = 'Tattersalls';
const PRODUCT_TATTSLOTTO = 'TattsLotto';

/**
 * Searches for draws with the given period and stores it into Firestore.
 */
async function main() {
  const argv = process.argv.slice(2);
  const [startTime, endTime] = argv;
  const draws = await dateRangeSearch(startTime, endTime);
  const promises = draws.map(async (draw) => {
    const path = `products/${draw.productId}/draws/${draw.id}`;
    const document = firestore.doc(path);
    return await document.set(draw);
  });
  await Promise.all(promises);
};

/**
 * Search on date range. In JSON format, the Timestamp type is encoded as a
 * string in the [RFC3339](https://www.ietf.org/rfc/rfc3339.txt) format.
 * The format is "{year}-{month}-{day}T{hour}:{min}:{sec}[.{frac_sec}]Z"
 * e.g. "2017-01-15T01:30:15.01Z"
 * @param {*} startTime Begin of the period.
 * @param {*} endTime End of the period.
 */
async function dateRangeSearch(startTime, endTime) {
  const request = mapKeys({
    companyFilter: [COMPANY_TATTERSALLS],
    productFilter: [PRODUCT_TATTSLOTTO],
    dateStart: moment(startTime).startOf('day'),
    dateEnd: moment(endTime || startTime).endOf('day'),
  }, (value, key) => upperFirst(key));
  const result = await axios.post(SEARCH_REQUEST_URL, request);
  const {draws} = mapKeysDeep(result.data, (value, key) => camelCase(key));
  return draws.map((draw) => {
    draw = renameKey(draw, 'drawNumber', 'id');
    draw = renameKey(draw, 'drawDate', 'date');
    unset(draw, 'ticketNumbers');
    set(draw, 'date', admin.firestore.Timestamp.fromDate(new Date(draw.date)));
    return draw;
  });
}

/**
 * Creates an object with the same values as `object` and keys generated by
 * running each own enumberable string keyed property of `object` thru
 * `iteratee` recursively . The iteratee is invoked with three arguments:
 * (value, key, object).
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @return {Object} Returns the new mapped object.
 */
function mapKeysDeep(object, iteratee) {
  return mapValues(
      mapKeys(object, iteratee),
      (value) => {
        if (isArray(value)) {
          return map(value, (item) => (
            isPlainObject(item) ? mapKeysDeep(item, iteratee) : item
          ));
        }
        return isPlainObject(value) ? mapKeysDeep(value, iteratee) : value;
      },
  );
}

/**
 * Renames the `key` of `object` to `newKey`.
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to rename.
 * @param {string} newKey The new key of the property to be renamed.
 * @return {Object} Returns `object`.
 */
function renameKey(object, key, newKey) {
  object = set(object, newKey, object[key]);
  unset(object, key);
  return object;
}

main().catch(console.error);
