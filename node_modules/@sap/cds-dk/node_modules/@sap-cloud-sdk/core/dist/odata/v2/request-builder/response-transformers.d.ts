import { Entity } from '../entity';
import { Constructable } from '../../common';
export declare function transformReturnValueForUndefined<ReturnT>(data: any, builderFn: (data: any) => ReturnT): ReturnT;
export declare function transformReturnValueForEntity<ReturnT extends Entity>(data: any, entityConstructor: Constructable<ReturnT>): ReturnT;
export declare function transformReturnValueForEntityList<ReturnT extends Entity>(data: any, entityConstructor: Constructable<ReturnT>): ReturnT[];
export declare function transformReturnValueForComplexType<ReturnT>(data: any, builderFn: (data: any) => ReturnT): ReturnT;
export declare function transformReturnValueForComplexTypeList<ReturnT>(data: any, builderFn: (data: any) => ReturnT): ReturnT[];
export declare function transformReturnValueForEdmType<ReturnT>(data: any, builderFn: (data: any) => ReturnT): ReturnT;
export declare function transformReturnValueForEdmTypeList<ReturnT>(data: any, builderFn: (data: any) => ReturnT): ReturnT[];
//# sourceMappingURL=response-transformers.d.ts.map