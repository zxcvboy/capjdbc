import { MapType } from '@sap-cloud-sdk/util';
/**
 * Create a header object based on the given key and value if neither key nor value are nullish.
 * @param key - Name of the header.
 * @param value - Value of the header.
 * @returns - An object containing the given key and value of an empty object.
 */
export declare function toSanitizedHeaderObject(key: string, value: any): MapType<any>;
/**
 * Find a header in a given header object, if available, idepdendent of the case (lower / upper).
 * @param key - Name of the header to be found.
 * @param headers - Header object to be searched for given key.
 * @returns - An object containing the given key (and value) in its original case, as found in `headers` or an empty object if not found.
 */
export declare function getHeader(key: string, headers?: MapType<any>): MapType<any>;
/**
 * Get the value of a header based on the given key, independent of the case (lower / upper).
 * @param key - Name of the header to be found.
 * @param headers - Header object to be searched for given key.
 * @returns The value of the header with the given key or undefined.
 */
export declare function getHeaderValue(key: string, headers?: MapType<any>): any | undefined;
/**
 * Filter headers that have nullish values.
 * @param headers - A header object to be filtered.
 * @returns - A filtered header object containing only headers with non-nullish values.
 */
export declare function filterNullishValues(headers?: MapType<any>): MapType<any>;
/**
 * Create a header object by replacing headers that are set as custom headers.
 * @param headers - A base header object that contains the headers that will be compared with `customHeaders`.
 * @param customHeaders - A header object to be compared with headers. Only headers present in `headers` will be compared.
 * @returns - An object containing all keys from the original `headers` object, where headers present in the `customHeaders` are replaced. Note that the case (upper / lower) used by `customHeaders` will be used.
 */
export declare function replaceDuplicateKeys(headers?: MapType<any>, customHeaders?: MapType<any>): MapType<any>;
//# sourceMappingURL=headers-util.d.ts.map