import { MapType } from '@sap-cloud-sdk/util';
import { ODataRequestConfig } from './odata-request-config';
export declare class ODataBatchRequestConfig extends ODataRequestConfig {
    readonly defaultServicePath: string;
    readonly batchId: string;
    static readonly content_type_prefix = "multipart/mixed; boundary=batch_";
    /**
     * Creates an instance of ODataBatchRequestConfig.
     *
     * @param defaultServicePath - The default OData service path
     * @param batchId - The batch id for building the header and the payload.
     */
    constructor(defaultServicePath: string, batchId: string);
    resourcePath(): string;
    queryParameters(): MapType<any>;
}
//# sourceMappingURL=odata-batch-request-config.d.ts.map