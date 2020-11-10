/*
 * PLEASE USE cds-runtime/lib/common/constants.js FOR NEW CONSTANTS
 */

const RO = ['READ']
const CU = ['CREATE', 'UPDATE']
const CD = ['CREATE', 'DELETE']
const UD = ['UPDATE', 'DELETE']
const CUD = ['CREATE', ...UD]
const CRUD = [...RO, ...CUD]
const DRAFT = ['CANCEL', 'PATCH', 'NEW', 'EDIT', 'SAVE', 'draftPrepare', 'draftActivate']
const RJ_DRAFT = ['draftActivate', 'EDIT']
const BEFORE_DRAFT = [
  ['PATCH', ['beforeUpdateDraft', 'beforeDefaultValuesKeys']],
  ['UPDATE', ['beforeUpdateDraft', 'beforeFilterReadOnlyFields', 'beforeDefaultValuesKeys', 'beforeInputValidation']],
  ['CANCEL', 'beforeDeleteOrCancelDraft']
]
const ON_DRAFT = [
  ['READ', 'onReadDraft'],
  ['CREATE', 'onDraftActivate'],
  ['PATCH', 'onPatchDraft'],
  ['UPDATE', 'onDraftActivate'],
  ['CANCEL', 'onCancelDraft']
]
const MOD = ['CREATE', 'UPDATE', 'NEW', 'PATCH', 'PUT']

const PR_AC_DRAFT = [['draftPrepare', 'onDraftPrepare'], ['draftActivate', 'onDraftActivateEvent']]
const TRANSACTION = ['COMMIT', 'ROLLBACK']

const DRAFT_COLUMNS = ['IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity', 'DraftAdministrativeData_DraftUUID']

const DRAFT_COLUMNS_FOR_CQN_SELECT = [
  { val: true, as: 'IsActiveEntity', cast: { type: 'cds.Boolean' } },
  { val: false, as: 'HasActiveEntity', cast: { type: 'cds.Boolean' } },
  { val: false, as: 'HasDraftEntity', cast: { type: 'cds.Boolean' } }
]

const LIMIT = {
  ANNOTATION: {
    DEFAULT: '@cds.query.limit.default',
    MAX: '@cds.query.limit.max',
    SHORTHAND: '@cds.query.limit'
  },
  PAGE: {
    MAX: 1000
  }
}

// object for simple access
const DATA_TYPES_NOT_TO_BE_CONVERTED_BY_COMPILER = new Set([
  'cds.Boolean',
  'cds.Integer',
  'cds.Integer16',
  'cds.Integer32',
  'cds.Integer64',
  'cds.Decimal',
  'cds.DecimalFloat',
  'cds.Float',
  'cds.Double'
])

module.exports = {
  messages: {
    DB_CONNECTION_MISSING: 'Database connection is missing'
  },
  events: {
    DEFAULT: [...CRUD, ...DRAFT, ...TRANSACTION],
    RO,
    CU,
    CD,
    UD,
    CUD,
    CRUD,
    DRAFT,
    CRUD_DRAFT: [...CRUD, ...DRAFT],
    CUD_DRAFT: [...CUD, ...DRAFT],
    RJ_DRAFT,
    BEFORE_DRAFT,
    ON_DRAFT,
    PR_AC_DRAFT,
    TRANSACTION,
    MOD
  },
  DATA_TYPES_NOT_TO_BE_CONVERTED_BY_COMPILER,
  DRAFT_COLUMNS,
  DRAFT_COLUMNS_FOR_CQN_SELECT,
  LIMIT
}
