import { EdmTypeSameConvertersUri } from '../../common';
declare type UriConverterMapping = {
    [key in EdmTypeSameConvertersUri]: (value: any) => string;
};
/**
 * @hidden
 */
export declare const uriConvertersCommon: UriConverterMapping;
/**
 * @hidden
 */
export declare function convertToUriForEdmString(value: any): string;
export {};
//# sourceMappingURL=uri-value-converter.d.ts.map