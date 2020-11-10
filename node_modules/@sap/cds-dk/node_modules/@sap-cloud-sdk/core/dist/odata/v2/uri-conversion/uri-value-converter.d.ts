import { EdmTypeShared } from '../../common';
import { EdmType } from '../edm-types';
declare type UriConverterMapping = {
    [key in EdmType]: (value: any) => string;
};
/**
 * @hidden
 */
export declare const uriConverters: UriConverterMapping;
/**
 * @hidden
 */
export declare function convertToUriFormat(value: any, edmType: EdmTypeShared<'v2'>): string;
export {};
//# sourceMappingURL=uri-value-converter.d.ts.map