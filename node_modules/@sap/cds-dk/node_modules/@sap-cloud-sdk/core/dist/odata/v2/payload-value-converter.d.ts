import BigNumber from 'bignumber.js';
import { Moment } from 'moment';
import { Time, EdmTypeShared } from '../common';
import { EdmType } from './edm-types';
/**
 * @hidden
 */
export declare function edmToTs<T extends EdmType>(value: any, edmType: EdmTypeShared<'v2'>): EdmToPrimitive<T>;
/**
 * @hidden
 */
export declare function tsToEdm(value: any, edmType: EdmTypeShared<'v2'>): any;
/**
 * @hidden
 * This function can be used for both Edm.DateTime and and Edm.DateTimeOffset.
 */
export declare function edmDateTimeToMoment(edmDateTime: string): Moment;
/**
 * @hidden
 * This function can be used for both Edm.DateTime and and Edm.DateTimeOffset.
 */
export declare function momentToEdmDateTime(momentInstance: Moment): string;
export declare type EdmToPrimitive<T extends EdmType> = T extends 'Edm.Int16' | 'Edm.Int32' | 'Edm.Single' | 'Edm.Double' | 'Edm.Float' | 'Edm.Byte' | 'Edm.SByte' ? number : T extends 'Edm.Decimal' | 'Edm.Int64' ? BigNumber : T extends 'Edm.DateTime' | 'Edm.DateTimeOffset' ? Moment : T extends 'Edm.String' | 'Edm.Guid' ? string : T extends 'Edm.Boolean' ? boolean : T extends 'Edm.Time' ? Time : any;
//# sourceMappingURL=payload-value-converter.d.ts.map