import { Entity } from '../entity';
import { Expandable } from '../../common/expandable';
import { Constructable } from '../../common';
export declare function getExpand<EntityT extends Entity>(expands: Expandable<EntityT>[] | undefined, entityConstructor: Constructable<EntityT>): Partial<{
    expand: string;
}>;
//# sourceMappingURL=get-expand.d.ts.map