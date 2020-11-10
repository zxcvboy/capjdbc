const util = require('util')

const generateUUID = require('../../../common/utils/uuid')
const { getBackLinks, isSelfManaged, getOnCondElements } = require('./backlinks')
const { isDraftEnabled, ensureNoDraftsSuffix, ensureDraftsSuffix } = require('../draft')
const { deepCopy, deepCopyArray } = require('../copy')
// const cqn2cqn4sql = require('../../common/utils/cqn2cqn4sql')

const getError = require('../../../common/error')

const _isAssociation = element => {
  return (
    element.type === 'cds.Association' && (!element['@odata.contained'] || element.name === 'DraftAdministrativeData')
  )
}

const _isComposition = element => {
  return (
    element.type === 'cds.Composition' ||
    (element.type === 'cds.Association' && element['@odata.contained'] && element.name !== 'DraftAdministrativeData')
  )
}

const isRootEntity = (definitions, entityName) => {
  const entity = definitions[entityName]
  if (!entity) return false

  // TODO: There can be unmanaged relations to some parent -> not detected by the following code
  const associationElements = Object.keys(entity.elements)
    .map(key => entity.elements[key])
    .filter(element => _isAssociation(element))

  for (const { target } of associationElements) {
    const parentEntity = definitions[target]
    for (const parentElementName of Object.keys(parentEntity.elements)) {
      const parentElement = parentEntity.elements[parentElementName]
      if (
        _isComposition(parentElement) &&
        parentElement.target === entityName &&
        !(parentElement.parent && ensureNoDraftsSuffix(parentElement.parent.name) === entityName)
      ) {
        return false
      }
    }
  }
  return true
}

const getCompositionRoot = (definitions, entity) => {
  const associationElements = Object.keys(entity.elements)
    .map(key => entity.elements[key])
    .filter(element => _isAssociation(element))

  for (const { target } of associationElements) {
    const parentEntity = definitions[target]
    for (const parentElementName of Object.keys(parentEntity.elements)) {
      const parentElement = parentEntity.elements[parentElementName]
      if (
        _isComposition(parentElement) &&
        parentElement.target === entity.name &&
        parentElement.target !== ensureNoDraftsSuffix(parentElement.parent.name)
      ) {
        return getCompositionRoot(definitions, parentEntity)
      }
    }
  }
  return entity
}

const _addNavigationToCompositionElements = (element, definitions, compositionTree, compositionMap, isManaged) => {
  const links = element.is2one ? getBackLinks(element, Object.keys(definitions[element.target].keys)) : []

  const compositionElement = Object.assign({}, compositionMap.get(element.target), { name: element.name, links })
  const backLinks = element.is2many
    ? getBackLinks(element, Object.keys(definitions[ensureNoDraftsSuffix(element.parent.name)].keys))
    : []

  if (isManaged) {
    compositionElement.backLinks = backLinks
  } else {
    compositionElement.customBackLinks = backLinks
  }

  compositionTree.compositionElements.push(compositionElement)
}

const _navigationExistsInCompositionMap = (element, compositionMap, includeAssociations) => {
  return (
    compositionMap.has(element.target) && (_isComposition(element) || (includeAssociations && _isAssociation(element)))
  )
}

const _isNonRecursiveNavigation = (element, rootEntityName, includeAssociations) => {
  return (
    rootEntityName !== element.target && (_isComposition(element) || (includeAssociations && _isAssociation(element)))
  )
}

const _isManaged = element => {
  return isSelfManaged(element) || !element.on
}

const _isUnManaged = element => {
  return element.on && !isSelfManaged(element)
}

const _getLinks = (element, definitions) => {
  return element.is2one && !isSelfManaged(element)
    ? getBackLinks(element, Object.keys(definitions[element.target].keys))
    : []
}

const _isAssocComp = (element, parent) => {
  return (
    element.target === parent.name &&
    (element.type === 'cds.Composition' || element.type === 'cds.Association') &&
    element.on
  )
}
const _checkIfBackLink = (element, definitions) => {
  const target = definitions[element.target]
  for (const elementName in target.elements) {
    const targetElement = target.elements[elementName]
    if (_isAssocComp(targetElement, element.parent)) {
      const onCondElements = getOnCondElements(targetElement.on)
      for (const el of onCondElements) {
        const { entityKey, targetKey } = el
        if (entityKey === `${elementName}.${element.name}` || targetKey === `${elementName}.${element.name}`) {
          return true
        }
      }
      return false
    }
  }
}

const _addBackLinksToCompositionTree = (element, definitions, compositionTree) => {
  if (_isUnManaged(element)) {
    if (_checkIfBackLink(element, definitions)) {
      const backLinks = getBackLinks(element, Object.keys(definitions[element.target].keys)).map(backLink => ({
        entityKey: backLink.targetKey,
        targetKey: backLink.entityKey,
        entityVal: backLink.targetVal,
        targetVal: backLink.entityVal,
        skip: backLink.skip
      }))
      compositionTree.customBackLinks.push(...backLinks)
    }
  } else {
    compositionTree.backLinks.push(
      ...getBackLinks(
        element,
        Object.values(definitions[element.target].keys)
          .filter(k => !k.is2one && !k.is2many)
          .map(k => k.name)
      )
    )
  }
}

const _skipPersistence = (element, definitions) => {
  return definitions[element.target]['@cds.persistence.skip'] === true
}

const _createSubElement = (element, definitions, parentEntityName) => {
  const links = _getLinks(element, definitions)
  const backLinks = []
  const subObject = { name: element.name, backLinks, links }

  if (_skipPersistence(element, definitions)) {
    subObject.skipPersistence = true
  }

  if (_isUnManaged(element)) {
    subObject.customBackLinks = getBackLinks(element, Object.keys(definitions[parentEntityName].keys))
  }

  return subObject
}

const _getCompositionTreeRec = ({
  rootEntityName,
  definitions,
  compositionMap,
  compositionTree,
  entityName,
  parentEntityName,
  includeAssociations
}) => {
  compositionMap.set(parentEntityName, compositionTree)
  compositionTree.source = parentEntityName
  if (parentEntityName !== rootEntityName) {
    compositionTree.target = entityName
  }
  compositionTree.compositionElements = []
  compositionTree.backLinks = compositionTree.backLinks || []
  compositionTree.customBackLinks = compositionTree.customBackLinks || []

  const parentEntity = definitions[parentEntityName]
  const elements = Object.keys(parentEntity.elements).map(key => parentEntity.elements[key])

  for (const element of elements) {
    if (_navigationExistsInCompositionMap(element, compositionMap, includeAssociations)) {
      _addNavigationToCompositionElements(element, definitions, compositionTree, compositionMap, _isManaged(element))
    } else if (_isNonRecursiveNavigation(element, rootEntityName, includeAssociations)) {
      const subObject = _createSubElement(element, definitions, parentEntityName)

      compositionTree.compositionElements.push(subObject)

      _getCompositionTreeRec({
        rootEntityName,
        definitions,
        compositionMap,
        compositionTree: subObject,
        entityName: parentEntityName,
        parentEntityName: element.target,
        includeAssociations: false
      })
    } else if (
      _isAssociation(element) &&
      element.target === compositionTree.target &&
      compositionMap.has(element.target)
    ) {
      _addBackLinksToCompositionTree(element, definitions, compositionTree)
    }
  }
}

const _removeLocalizedTextsFromDraftTree = (compositionTree, definitions, checkedEntities = new Set()) => {
  for (const e of compositionTree.compositionElements) {
    if (checkedEntities.has(e.source)) {
      return
    }

    const target = definitions[e.target]
    if (e.name === 'texts' && target.elements.localized && !target['@fiori.draft.enabled']) {
      compositionTree.compositionElements.splice(compositionTree.compositionElements.indexOf(e), 1)
    } else {
      checkedEntities.add(e.source)
      _removeLocalizedTextsFromDraftTree(e, definitions, checkedEntities)
    }
  }
}

const memoizeGetCompositionTree = fn => {
  const cache = new Map()
  return (definitions, rootEntityName, checkRoot = true, includeAssociations = false) => {
    const key = [rootEntityName, checkRoot, includeAssociations].join('#')

    const map = cache.get(definitions)
    const cachedResult = map && map.get(key)
    if (cachedResult) return cachedResult

    const compTree = fn(definitions, rootEntityName, checkRoot, includeAssociations)

    const _map = map || new Map()
    _map.set(key, compTree)
    if (!map) cache.set(definitions, _map)
    return compTree
  }
}

const _getCompositionTree = (definitions, rootEntityName, checkRoot = true, includeAssociations = false) => {
  if (checkRoot && !isRootEntity(definitions, rootEntityName)) {
    throw getError(`Entity "${rootEntityName}" is not root entity`)
  }
  const compositionTree = {}
  _getCompositionTreeRec({
    rootEntityName,
    definitions,
    compositionMap: new Map(),
    compositionTree,
    entityName: rootEntityName,
    parentEntityName: rootEntityName,
    includeAssociations
  })

  if (isDraftEnabled(definitions[rootEntityName])) {
    _removeLocalizedTextsFromDraftTree(compositionTree, definitions)
  }

  return compositionTree
}

/**
 * Provides tree of all compositions. (Cached)
 * @param {Object} definitions Definitions of the reflected model
 * @param {String} rootEntityName Name of the root entity
 * @param {boolean} checkRoot Check is provided entity is a root
 * @returns {Object} tree of all compositions
 * @throws Error if no valid root entity provided
 */
const getCompositionTree = memoizeGetCompositionTree(_getCompositionTree)

const _addDraftSuffix = (draft, name) => {
  return draft ? ensureDraftsSuffix(name) : ensureNoDraftsSuffix(name)
}

const _dataElements = entity => {
  return Object.keys(entity.elements)
    .map(key => entity.elements[key])
    .filter(({ type, virtual }) => type !== 'cds.Association' && type !== 'cds.Composition' && !virtual)
}

const _keyElements = entity => {
  return Object.keys(entity.keys)
    .map(key => entity.keys[key])
    .filter(({ type, virtual }) => type !== 'cds.Association' && type !== 'cds.Composition' && !virtual)
}

const _isCompOrAssoc = (entity, k, onlyToOne) => {
  return (
    entity.elements &&
    entity.elements[k] &&
    (entity.elements[k].type === 'cds.Composition' || entity.elements[k].type === 'cds.Association') &&
    ((onlyToOne && entity.elements[k].is2one) || !onlyToOne)
  )
}

const _cleanDeepData = (entity, data, onlyToOne = false) => {
  if (!Array.isArray(data)) {
    return _cleanDeepData(entity, [data], onlyToOne)[0]
  }
  return data.map(entry => {
    return Object.keys(entry || {}).reduce((result, k) => {
      if (!_isCompOrAssoc(entity, k, onlyToOne)) {
        result[k] = entry[k]
      }
      return result
    }, {})
  })
}

const _key = (entity, data) => {
  return _keyElements(entity).reduce((result, element) => {
    result[element.name] = data[element.name]
    return result
  }, {})
}

const _keys = (entity, data) => {
  return data.map(entry => {
    return _key(entity, entry)
  })
}

const _parentKey = (element, key) => {
  const parentKey = {}

  element.customBackLinks.reduce((parentKey, customBackLink) => {
    parentKey[customBackLink.entityKey] = key[customBackLink.targetKey]
    return parentKey
  }, parentKey)

  return element.backLinks.reduce((parentKey, backlink) => {
    parentKey[backlink.entityKey] = key[backlink.targetKey]
    return parentKey
  }, parentKey)
}

const _parentKeys = (element, keys) => {
  return keys.map(key => {
    return _parentKey(element, key)
  })
}

const _whereKey = key => {
  const where = []
  Object.keys(key).forEach(keyPart => {
    if (where.length > 0) {
      where.push('and')
    }
    where.push({ ref: [keyPart] }, '=', { val: key[keyPart] })
  })
  return where
}

const _whereKeys = keys => {
  const where = []
  keys.forEach(key => {
    if (where.length > 0) {
      where.push('or')
    }
    where.push('(', ..._whereKey(key), ')')
  })
  return where
}

const _isDataPartOf = (data, otherData) => {
  if (!Array.isArray(data)) {
    return _isDataPartOf([data], [otherData])
  }
  return data.every((entry, index) => {
    const otherEntry = otherData[index]
    return Object.keys(entry).every(key => {
      return entry[key] === (otherEntry && otherEntry[key])
    })
  })
}

const _findWhere = (data, where) => {
  return data.filter(entry => {
    return Object.keys(where).every(key => {
      return where[key] === entry[key]
    })
  })
}

const _diffData = (data, otherData) => {
  return Object.keys(data).reduce((result, key) => {
    const dataVal = _val(data[key])
    const otherDataVal = _val(otherData[key])
    if (dataVal !== undefined && dataVal !== otherDataVal) {
      result[key] = data[key]
    }
    return result
  }, {})
}

const _toOneElements = subEntity => {
  return Object.keys(subEntity.elements)
    .map(key => subEntity.elements[key])
    .filter(element => element.is2one)
}

const _toManyElements = subEntity => {
  return Object.keys(subEntity.elements)
    .map(key => subEntity.elements[key])
    .filter(element => element.is2many)
}
const _addToOneKeyIfNeeded = (subDataEntry, toOneKeys) => {
  if (Object.keys(toOneKeys).length !== 0) {
    Object.keys(toOneKeys).forEach(key => {
      if (subDataEntry.hasOwnProperty(key) && subDataEntry[key] === undefined) {
        Object.assign(subDataEntry, { [key]: toOneKeys[key] })
      }
    })
  }
}
const _toOneKeys = (subDataEntry, data, toOneElements, element) => {
  const toOneKeys = {}
  for (const toOneElement of toOneElements) {
    if (toOneElement.name in subDataEntry) {
      // self referencing backlinks
      const links = element.compositionElements.find(
        compositionElement => compositionElement.name === toOneElement.name
      ).links
      const toOneData = subDataEntry[toOneElement.name]
      for (const link of links) {
        toOneKeys[link.entityKey] = toOneData[link.targetKey]
      }
    } else {
      const backLinks = [...element.backLinks, ...element.customBackLinks]
      for (const backLink of backLinks) {
        if (backLink.skip) {
          continue
        }
        toOneKeys[backLink.entityKey] = data[backLink.targetKey]
      }
    }
  }
  return toOneKeys
}

const _toManyKeys = (data, toManyElements, element) => {
  const toManyKeys = {}
  for (const toManyElement of toManyElements) {
    if (element.name === toManyElement.name) {
      for (const backLink of element.backLinks) {
        toManyKeys[backLink.entityKey] = data[backLink.targetKey] || null
      }
    }
  }

  if (element.customBackLinks.length > 0) {
    for (const customBackLink of element.customBackLinks) {
      if (!data[customBackLink.targetKey] && customBackLink.skip) {
        continue
      }
      toManyKeys[customBackLink.entityKey] = data[customBackLink.targetKey] || null
    }
  }

  return toManyKeys
}

const propagateKeys = (subEntity, element, data, subData) => {
  if (!element) {
    return
  }

  const toOneElements = _toOneElements(subEntity)
  const toManyElements = _toManyElements(subEntity)
  const result = []

  for (const subDataEntry of subData) {
    const toOneKeys = _toOneKeys(subDataEntry, data, toOneElements, element)
    const toManyKeys = _toManyKeys(data, toManyElements, element)
    result.push(Object.assign({}, subDataEntry, toManyKeys, toOneKeys))

    // required for odata so keys from custom onconds are available in the response
    Object.assign(subDataEntry, toManyKeys)
    // add to one keys without breaking integrity checks
    _addToOneKeyIfNeeded(subDataEntry, toOneKeys)
  }
  return result
}

const hasCompositionDelete = (definitions, cqn) => {
  if (cqn && cqn.DELETE && cqn.DELETE.from) {
    const entityName = ensureNoDraftsSuffix(cqn.DELETE.from.name || cqn.DELETE.from)
    const entity = definitions && definitions[entityName]
    if (entity) {
      return !!Object.keys(entity.elements || {}).find(k => _isComposition(entity.elements[k]))
    }
  }
  return false
}

const _hasWhereInDelete = cqn => cqn.DELETE && cqn.DELETE.where && cqn.DELETE.where.length > 0

function _getSubWhereAndEntities (allBackLinks, draft, element) {
  let entity1, entity2
  const subWhere = allBackLinks.reduce((result, backLink) => {
    if (result.length > 0) {
      result.push('and')
    }

    entity1 = {
      alias: 'ALIAS1',
      entityName: _addDraftSuffix(draft, element.source),
      propertyName: backLink.entityKey
    }
    const res1 = backLink.entityKey ? { ref: [entity1.alias, entity1.propertyName] } : { val: backLink.entityVal }

    entity2 = {
      alias: 'ALIAS2',
      entityName: _addDraftSuffix(draft, element.target || element.source),
      propertyName: backLink.targetKey
    }
    const res2 = backLink.targetKey ? { ref: [entity2.alias, entity2.propertyName] } : { val: backLink.targetVal }

    result.push(res1, '=', res2)
    return result
  }, [])
  return {
    subWhere,
    entity1,
    entity2
  }
}

function _getWhereKeys (allBackLinks, entity1) {
  return allBackLinks.reduce((result, backLink) => {
    if (result.length > 0) {
      result.push('or')
    }
    if (backLink.entityKey) {
      result.push({ ref: [entity1.alias, backLink.entityKey] }, 'is not null')
    } else if (backLink.entityVal !== undefined) {
      // static values should not be included
      result.pop()
    }

    return result
  }, [])
}

const _addSubCascadeDeleteCQN = (compositionTree, level, cqns, draft, set = new Set()) => {
  compositionTree.compositionElements.forEach(element => {
    if ((!set.has(element.name) || element.target) && !element.skipPersistence) {
      const allBackLinks = [...element.backLinks, ...element.customBackLinks]
      const { entity1, entity2, subWhere } = _getSubWhereAndEntities(allBackLinks, draft, element)
      const whereKeys = _getWhereKeys(allBackLinks, entity1)

      if (allBackLinks.length > 0) {
        const where = []
        if (whereKeys.length > 0) {
          where.push('(', ...whereKeys, ')', 'and')
        }
        where.push('not exists', {
          SELECT: {
            columns: [{ val: 1, as: '_exists' }],
            from: { ref: [entity2.entityName], as: entity2.alias },
            where: subWhere
          }
        })
        const subCQN = { DELETE: { from: { ref: [entity1.entityName], as: entity1.alias }, where: where } }
        cqns[level] = cqns[level] || []
        cqns[level].push(subCQN)

        set.add(element.name)
        _addSubCascadeDeleteCQN(element, level + 1, cqns, draft, set)
      }
    }
  })
  return cqns
}

const createCascadeDeleteCQNs = (definitions, cqn) => {
  const from = cqn.DELETE.from.name || cqn.DELETE.from
  const entityName = ensureNoDraftsSuffix(from)
  // REVISIT: baaad check!
  const draft = entityName !== from
  const compositionTree = getCompositionTree(definitions, entityName, false)
  return [[cqn], ..._addSubCascadeDeleteCQN(compositionTree, 0, [], draft)]
}

const _addSubReverseCascadeDeleteCQN = (compositionTree, level, cqn, cqns, draft, set = new Set()) => {
  compositionTree.compositionElements.forEach(element => {
    if (!set.has(element.name) || element.target) {
      let entity1
      let entity2

      const allBackLinks = [...element.backLinks, ...element.customBackLinks]

      const subWhere = [
        ...allBackLinks.reduce((result, backLink) => {
          if (result.length > 0) {
            result.push('and')
          }

          entity1 = {
            alias: 'ALIAS1',
            entityName: _addDraftSuffix(draft, element.source),
            propertyName: backLink.entityKey
          }
          entity2 = {
            alias: 'ALIAS2',
            entityName: _addDraftSuffix(draft, element.target || element.source),
            propertyName: backLink.targetKey
          }

          result.push({ ref: [entity1.alias, entity1.propertyName] }, '=', {
            ref: [entity2.alias, entity2.propertyName]
          })
          return result
        }, [])
      ]
      if (_hasWhereInDelete(cqn)) {
        subWhere.push('and', '(', ...(cqn.DELETE.where || []), ')')
      }
      const whereKey = allBackLinks.reduce(result => {
        if (result.length > 0) {
          result.push('or')
        }
        result.push({ ref: [entity1.alias, entity1.propertyName] }, 'is not null')
        return result
      }, [])
      if (allBackLinks.length > 0) {
        const where = [
          '(',
          ...whereKey,
          ')',
          'and',
          'exists',
          {
            SELECT: {
              columns: [{ val: 1, as: '_exists' }],
              from: { ref: [entity2.entityName], as: entity2.alias },
              where: subWhere
            }
          }
        ]
        const subCQN = { DELETE: { from: { ref: [entity1.entityName], as: entity1.alias }, where: where } }
        cqns[level] = cqns[level] || []
        cqns[level].push(subCQN)
        set.add(element.name)
        _addSubReverseCascadeDeleteCQN(element, level + 1, subCQN, cqns, draft, set)
      }
    }
  })
  return cqns
}

const createReverseCascadeDeleteCQNs = (definitions, cqn) => {
  const from = cqn.DELETE.from.name || cqn.DELETE.from
  const entityName = ensureNoDraftsSuffix(from)
  const draft = entityName !== from
  const compositionTree = getCompositionTree(definitions, entityName, false)
  return [[cqn], ..._addSubReverseCascadeDeleteCQN(compositionTree, 0, cqn, [], draft)].reverse()
}

const hasDeepInsert = (definitions, cqn) => {
  if (cqn && cqn.INSERT && cqn.INSERT.into && cqn.INSERT.entries) {
    const entityName = ensureNoDraftsSuffix(cqn.INSERT.into.name || cqn.INSERT.into)
    const entity = definitions && definitions[entityName]
    if (entity) {
      return !!cqn.INSERT.entries.find(entry => {
        return !!Object.keys(entry || {}).find(k => {
          return _isCompOrAssoc(entity, k)
        })
      })
    }
  }
  return false
}

const _generateKeysIfNeeded = (entity, data) => {
  for (const keyDefinition of Object.values(entity.keys)) {
    if (keyDefinition.key && keyDefinition.type === 'cds.UUID' && data[keyDefinition.name] === undefined) {
      data[keyDefinition.name] = generateUUID()
    }
  }
}

const _addSubDeepInsertCQN = (definitions, compositionTree, data, cqns, draft) => {
  compositionTree.compositionElements.forEach(element => {
    if (element.skipPersistence) {
      return
    }
    const subEntity = definitions[element.source]
    const into = _addDraftSuffix(draft, element.source)
    const insertCQN = { INSERT: { into: into, entries: [] } }
    const subData = data.reduce((result, entry) => {
      if (element.name in entry) {
        const elementValue = _val(entry[element.name])
        const subData = _array(elementValue)

        for (const data of subData) {
          _generateKeysIfNeeded(subEntity, data)
        }

        if (subData.length > 0) {
          insertCQN.INSERT.entries.push(..._cleanDeepData(subEntity, propagateKeys(subEntity, element, entry, subData)))
          result.push(...subData)
        }
      }
      return result
    }, [])
    if (insertCQN.INSERT.entries.length > 0) {
      cqns.push(insertCQN)
    }
    if (subData.length > 0) {
      _addSubDeepInsertCQN(definitions, element, subData, cqns, draft)
    }
  })
  return cqns
}

const _checkForToManyAssociation = (toManyElements, dataEntry, event) => {
  for (const toManyElement of toManyElements) {
    if (_isAssociation(toManyElement) && dataEntry[toManyElement.name] !== undefined) {
      throw getError(400, `Deep ${event} with to-many Associations is not allowed`)
    }
  }
}

const createDeepInsertCQNs = (definitions, cqn) => {
  const into = cqn.INSERT.into.name || cqn.INSERT.into
  const entityName = ensureNoDraftsSuffix(into)
  const draft = entityName !== into
  const dataEntries = cqn.INSERT.entries ? deepCopyArray(cqn.INSERT.entries) : []
  const entity = definitions && definitions[entityName]
  const compositionTree = getCompositionTree(definitions, entityName, false, !draft)

  const flattenedCqn = { INSERT: Object.assign({}, cqn.INSERT) }
  flattenedCqn.INSERT.entries = []

  const toOneElements = _toOneElements(entity)
  const toManyElements = _toManyElements(entity)
  for (const dataEntry of dataEntries) {
    _checkForToManyAssociation(toManyElements, dataEntry, 'insert')
    _generateKeysIfNeeded(entity, dataEntry)

    const toOneKeys = _toOneKeys(dataEntry, dataEntries, toOneElements, compositionTree)
    flattenedCqn.INSERT.entries.push(_cleanDeepData(entity, Object.assign({}, dataEntry, toOneKeys)))
  }
  return [flattenedCqn, ..._addSubDeepInsertCQN(definitions, compositionTree, dataEntries, [], draft)]
}

const hasDeepUpdate = (definitions, cqn) => {
  if (cqn && cqn.UPDATE && cqn.UPDATE.entity && (cqn.UPDATE.data || cqn.UPDATE.with)) {
    const entityName =
      (cqn.UPDATE.entity.ref && cqn.UPDATE.entity.ref[0]) || cqn.UPDATE.entity.name || cqn.UPDATE.entity
    const entity = definitions && definitions[ensureNoDraftsSuffix(entityName)]
    if (entity) {
      return !!Object.keys(Object.assign({}, cqn.UPDATE.data || {}, cqn.UPDATE.with || {})).find(k => {
        return _isCompOrAssoc(entity, k)
      })
    }
  }
  return false
}

function _selectDeepUpdateDataRecursion ({ definitions, compositionTree, entityName, data, result, draft, execute }) {
  const entity = definitions && definitions[entityName]
  const keys = _keys(entity, result)
  return Promise.all(
    compositionTree.compositionElements.map(element => {
      if (element.skipPersistence) {
        return Promise.resolve()
      }
      if (
        data !== undefined &&
        !data.find(entry => {
          return element.name in entry
        })
      ) {
        return Promise.resolve()
      }
      const subData =
        data &&
        data.reduce((result, entry) => {
          if (element.name in entry) {
            const elementValue = _val(entry[element.name])
            result.push(..._array(elementValue))
          }
          return result
        }, [])

      let where
      if (element.links && element.links.length > 0) {
        const whereObj = element.links.reduce((res, currentLink) => {
          res[currentLink.targetKey] = result[0][currentLink.entityKey]
          return res
        }, {})
        where = _whereKey(whereObj)
      }

      return _selectDeepUpdateData({
        definitions,
        compositionTree: element,
        entityName: element.source,
        data: subData,
        where,
        selectData: result,
        parentKeys: _parentKeys(element, keys),
        draft,
        execute
      })
    })
  )
}

const _selectDeepUpdateDataResult = ({
  definitions,
  compositionTree,
  entityName,
  data,
  selectData,
  root,
  draft,
  result,
  execute
}) => {
  if (root) {
    selectData.push(...result)
  } else {
    selectData.forEach(selectEntry => {
      selectEntry[compositionTree.name] = selectEntry[compositionTree.name] || []
      selectEntry[compositionTree.name].push(..._findWhere(result, _parentKey(compositionTree, selectEntry)))
    })
  }
  if (result.length === 0) {
    return Promise.resolve()
  }
  return _selectDeepUpdateDataRecursion({ definitions, compositionTree, entityName, data, result, draft, execute })
}

const _getLinksOfCompTree = compositionTree => {
  const links = []
  for (const compElement of compositionTree.compositionElements || []) {
    for (const link of compElement.links || []) {
      links.push(link.entityKey)
    }
  }
  return links
}

const _isSingleton = context => {
  if (!context || !context.target) {
    return
  }

  return (
    context.target['@odata.singleton'] ||
    (context.target['@odata.singleton.nullable'] && context.target['@odata.singleton'] !== false)
  )
}

const _selectDeepUpdateData = ({
  definitions,
  compositionTree,
  entityName,
  data,
  selectData,
  where,
  orderBy,
  parentKeys,
  draft,
  execute,
  includeAllRootColumns,
  singleton,
  alias
}) => {
  const root = !selectData
  const entity = definitions && definitions[entityName]
  const from = _addDraftSuffix(draft, entity.name)
  const selectCQN = { SELECT: { from: { ref: [from] } } }
  if (alias) selectCQN.SELECT.from.as = alias
  const links = _getLinksOfCompTree(compositionTree)
  if (data !== undefined) {
    selectCQN.SELECT.columns = []
    const backLinkKeys = [
      ...compositionTree.backLinks.map(backLink => backLink.entityKey),
      ...compositionTree.customBackLinks.map(customBackLink => customBackLink.entityKey)
    ]
    _dataElements(entity).forEach(element => {
      if (element.key || links.includes(element.name) || backLinkKeys.includes(element.name)) {
        selectCQN.SELECT.columns.push({ ref: [element.name] })
      } else if (
        (includeAllRootColumns && root) ||
        data.find(entry => {
          return element.name in entry
        })
      ) {
        selectCQN.SELECT.columns.push({ ref: [element.name] })
      }
    })
  }
  if (where) {
    selectCQN.SELECT.where = where
  } else if (parentKeys) {
    selectCQN.SELECT.where = _whereKeys(parentKeys)
  }
  if (orderBy) {
    selectCQN.SELECT.orderBy = orderBy
  }
  if (singleton) {
    selectCQN.SELECT.limit = { rows: { val: 1 } }
  }
  selectData = selectData || []
  return execute(selectCQN)
    .then(result => {
      return _selectDeepUpdateDataResult({
        definitions,
        compositionTree,
        entityName,
        data,
        selectData,
        where,
        parentKeys,
        root,
        result,
        draft,
        execute
      })
    })
    .then(() => {
      return selectData
    })
}

const selectDeepData = (definitions, entity, data, execute) => {
  if (!Array.isArray(data)) {
    return selectDeepData(definitions, entity, [data], execute)
  }
  const from = entity.name || entity
  const entityName = ensureNoDraftsSuffix(from)
  const modelEntity = definitions && definitions[entityName]
  const draft = entityName !== from
  const keys = _keys(modelEntity, data)
  const compositionTree = getCompositionTree(definitions, entityName, false, !draft)
  return _selectDeepUpdateData({
    definitions,
    compositionTree,
    entityName,
    data: !_isDataPartOf(data, keys) ? data : undefined,
    where: _whereKeys(keys),
    draft,
    execute
  })
}
const _isSameEntity = (cqn, context) => {
  const where = cqn.UPDATE.where || []
  const persistentObj = Array.isArray(context._.partialPersistentState)
    ? context._.partialPersistentState[0]
    : context._.partialPersistentState
  if (!persistentObj) {
    // If no data was found we don't know if it is the same entity
    return false
  }
  // TODO: REVISIT: this check must happen recursively for not to sql flattened CQN
  if (
    context &&
    context.target &&
    context.target.query &&
    context.target.query._target &&
    context.target.query._target.name !== (cqn.UPDATE.entity.ref && cqn.UPDATE.entity.ref[0]) &&
    context.target.query._target.name !== cqn.UPDATE.entity
  ) {
    return false
  }
  for (let i = 0; i < where.length; i++) {
    if (!where[i] || !where[i].ref || !context.target.elements[where[i].ref]) {
      continue
    }
    const key = where[i].ref
    const val = where[i + 2].val
    const sign = where[i + 1]
    // eslint-disable-next-line
    if (context.target.elements[key].key && key in persistentObj && sign === '=' && val != persistentObj[key]) {
      return false
    }
  }
  return true
}

const selectDeepUpdateData = (definitions, cqn, execute, context, includeAllRootColumns = false) => {
  const cqn2cqn4sql = require('../../../common/utils/cqn2cqn4sql')
  const sqlQuery = cqn2cqn4sql(cqn, { definitions })

  // TODO: REVISIT: isSameEntity must check recursively until table and not just one level
  if (context && _isSameEntity(sqlQuery, context)) {
    return Promise.resolve(context._.partialPersistentState)
  }
  const from =
    (sqlQuery.UPDATE.entity.ref && sqlQuery.UPDATE.entity.ref[0]) ||
    sqlQuery.UPDATE.entity.name ||
    sqlQuery.UPDATE.entity
  const alias = sqlQuery.UPDATE.entity.as
  const where = sqlQuery.UPDATE.where || []
  const entityName = ensureNoDraftsSuffix(from)
  const draft = entityName !== from

  const orderBy =
    context &&
    context.target &&
    context.target.query &&
    context.target.query.SELECT &&
    context.target.query.SELECT.orderBy
  const data = Object.assign({}, cqn.UPDATE.data || {}, cqn.UPDATE.with || {})
  const compositionTree = getCompositionTree(definitions, entityName, false, !draft)
  return _selectDeepUpdateData({
    definitions,
    compositionTree,
    entityName,
    data: [data],
    where,
    orderBy,
    draft,
    execute,
    includeAllRootColumns,
    singleton: _isSingleton(context),
    alias
  })
}

function _addSubDeepUpdateCQNForDelete ({ entity, data, selectData, deleteCQN }) {
  const dataByKey = _dataByKey(entity, data)
  for (const selectEntry of selectData) {
    const dataEntry = dataByKey.get(_serializedKey(entity, selectEntry))
    if (!dataEntry) {
      if (deleteCQN.DELETE.where.length > 0) {
        deleteCQN.DELETE.where.push('or')
      }
      deleteCQN.DELETE.where.push('(', ..._whereKey(_key(entity, selectEntry)), ')')
    }
  }
}

function _fillLinkFromStructuredData (entity, entry) {
  for (const elementName in entity.elements) {
    const foreignKey4 = entity.elements[elementName]['@odata.foreignKey4']
    if (foreignKey4 && entry[foreignKey4]) {
      const foreignKey = entity.elements[elementName].name
      const childKey = foreignKey.split('_')[1]
      entry[foreignKey] = _unwrapVal(entry[foreignKey4])[childKey]
    }
  }
}

function _addSubDeepUpdateCQNForUpdateInsert ({ entity, entityName, data, selectData, updateCQNs, insertCQN }) {
  const selectDataByKey = _dataByKey(entity, selectData)
  const spliceIdx = []
  for (const [idx, entry] of data.entries()) {
    const key = _key(entity, entry)
    const selectEntry = selectDataByKey.get(_serializedKey(entity, entry))
    _fillLinkFromStructuredData(entity, entry)
    if (selectEntry) {
      const diff = _diffData(_cleanDeepData(entity, entry), _cleanDeepData(entity, selectEntry))
      if (Object.keys(diff).length > 0) {
        updateCQNs.push({
          UPDATE: { entity: entityName, data: diff, where: _whereKey(key) }
        })
      }
    } else {
      insertCQN.INSERT.entries.push(_cleanDeepData(entity, entry, true))
      spliceIdx.push(idx)
    }
  }
  // TODO: Why do we splice here?
  for (const idx of spliceIdx) data.splice(idx, 1)
}

function _addSubDeepUpdateCQNCollectDelete (deleteCQNs, cqns, index) {
  deleteCQNs.forEach(deleteCQN => {
    if (
      !cqns.find((subCQNs, subIndex) => {
        if (subIndex > 0) {
          const deleteIndex = subCQNs.findIndex(cqn => {
            return cqn.DELETE && cqn.DELETE.from === deleteCQN.DELETE.from
          })
          if (deleteIndex > -1) {
            if (subIndex < index) {
              subCQNs.splice(deleteIndex, 1)
            } else {
              return true
            }
          }
        }
        return false
      })
    ) {
      cqns[index] = cqns[index] || []
      cqns[index].push(deleteCQN)
    }
  })
}

const _dataByKey = (entity, data) => {
  const dataByKey = new Map()
  for (const entry of data) {
    dataByKey.set(_serializedKey(entity, entry), entry)
  }
  return dataByKey
}

const _serializedKey = (entity, data) => {
  return JSON.stringify(
    _keyElements(entity)
      .map(key => key.name)
      .sort()
      .map(keyName => data[keyName])
  )
}

function _mergeInsertCqns (intoCQN, insertCQN) {
  // HACK for uniqueness (cf. https://github.wdf.sap.corp/cap/issues/issues/5458)
  insertCQN.INSERT.entries.forEach(e1 => {
    const hasIt = intoCQN.INSERT.entries.find(e2 => util.isDeepStrictEqual(e1, e2))
    if (!hasIt) intoCQN.INSERT.entries.push(e1)
  })
}

function _addSubDeepUpdateCQNCollect (definitions, cqns, updateCQNs, insertCQN, deleteCQN) {
  if (updateCQNs.length > 0) {
    cqns[0] = cqns[0] || []
    cqns[0].push(...updateCQNs)
  }
  if (insertCQN.INSERT.entries.length > 0) {
    cqns[0] = cqns[0] || []
    createDeepInsertCQNs(definitions, insertCQN).forEach(insertCQN => {
      const intoCQN = cqns[0].find(cqn => {
        return cqn.INSERT && cqn.INSERT.into === insertCQN.INSERT.into
      })
      if (!intoCQN) {
        cqns[0].push(insertCQN)
      } else {
        _mergeInsertCqns(intoCQN, insertCQN)
      }
    })
  }
  if (deleteCQN.DELETE.where.length > 0) {
    cqns[0] = cqns[0] || []
    cqns[0].push(deleteCQN)
    createCascadeDeleteCQNs(definitions, deleteCQN).forEach((deleteCQNs, index) => {
      if (index > 0) {
        _addSubDeepUpdateCQNCollectDelete(deleteCQNs, cqns, index)
      }
    })
  }
}

const _propagatedSubData = (entity, element, entry, elementValue) =>
  propagateKeys(entity, element, entry, _array(elementValue))

const _val = element => (element && element.val) || element

const _array = x => (Array.isArray(x) ? x : [x])

const _unwrapIfNotArray = x => (Array.isArray(x) ? x : _unwrapVal(x))

const _unwrapVal = obj => {
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value && value.val) obj[key] = value.val
  }
  return obj
}

const _addToData = (subData, entity, element, entry) => {
  const value = _val(entry[element.name])
  const subDataEntries = _propagatedSubData(entity, element, entry, value)
  const unwrappedSubData = subDataEntries.map(entry => _unwrapIfNotArray(entry))
  subData.push(...unwrappedSubData)
}

function _addSubDeepUpdateCQNRecursion ({ definitions, compositionTree, entity, data, selectData, cqns, draft }) {
  const selectDataByKey = _dataByKey(entity, selectData)
  for (const element of compositionTree.compositionElements) {
    const subData = []
    const selectSubData = []
    for (const entry of data) {
      if (element.name in entry) {
        _addToData(subData, entity, element, entry)
        const selectEntry = selectDataByKey.get(_serializedKey(entity, entry))
        if (selectEntry && element.name in selectEntry) {
          _addToData(selectSubData, entity, element, selectEntry)
        }
      }
    }
    _addSubDeepUpdateCQN({
      definitions,
      compositionTree: element,
      data: subData,
      selectData: selectSubData,
      cqns,
      draft
    })
  }
  return cqns
}

const _addSubDeepUpdateCQN = ({ definitions, compositionTree, data, selectData, cqns, draft }) => {
  const entity = definitions && definitions[compositionTree.source]
  if (entity['@cds.persistence.skip'] === true) {
    return Promise.resolve()
  }
  const entityName = _addDraftSuffix(draft, entity.name)
  const updateCQNs = []
  const insertCQN = { INSERT: { into: entityName, entries: [] } }
  const deleteCQN = { DELETE: { from: entityName, where: [] } }
  _addSubDeepUpdateCQNForDelete({ entity, data, selectData, deleteCQN })
  _addSubDeepUpdateCQNForUpdateInsert({
    entity,
    entityName,
    data,
    selectData,
    updateCQNs,
    insertCQN
  })
  _addSubDeepUpdateCQNCollect(definitions, cqns, updateCQNs, insertCQN, deleteCQN)
  if (data.length === 0) {
    return Promise.resolve()
  }
  return _addSubDeepUpdateCQNRecursion({
    definitions,
    compositionTree,
    entity,
    data,
    selectData,
    cqns,
    draft
  })
}

const createDeepUpdateCQNs = (definitions, cqn, selectData) => {
  if (!Array.isArray(selectData)) {
    return createDeepUpdateCQNs(definitions, cqn, [selectData])
  }
  if (selectData.length === 0) {
    return []
  }
  if (selectData.length > 1) {
    throw getError('Deep update can only be performed on a single instance')
  }
  const cqns = []
  const from = (cqn.UPDATE.entity.ref && cqn.UPDATE.entity.ref[0]) || cqn.UPDATE.entity.name || cqn.UPDATE.entity
  const entityName = ensureNoDraftsSuffix(from)
  const draft = entityName !== from
  const data = cqn.UPDATE.data ? deepCopy(cqn.UPDATE.data) : {}
  const withObj = cqn.UPDATE.with ? deepCopy(cqn.UPDATE.with) : {}
  const entity = definitions && definitions[entityName]
  const entry = Object.assign({}, data, withObj, _key(entity, selectData[0]))
  const compositionTree = getCompositionTree(definitions, entityName, false, !draft)

  const toManyElements = _toManyElements(entity)
  _checkForToManyAssociation(toManyElements, entry, 'update')

  const subCQNs = _addSubDeepUpdateCQN({ definitions, compositionTree, data: [entry], selectData, cqns: [], draft })
  subCQNs.forEach((subCQNs, index) => {
    cqns[index] = cqns[index] || []
    cqns[index].push(...subCQNs)
  })
  return cqns
}

module.exports = {
  propagateKeys,
  isRootEntity,
  getCompositionTree,
  getCompositionRoot,
  hasCompositionDelete,
  hasDeepInsert,
  hasDeepUpdate,
  createCascadeDeleteCQNs,
  createReverseCascadeDeleteCQNs,
  createDeepInsertCQNs,
  createDeepUpdateCQNs,
  selectDeepData,
  selectDeepUpdateData
}
