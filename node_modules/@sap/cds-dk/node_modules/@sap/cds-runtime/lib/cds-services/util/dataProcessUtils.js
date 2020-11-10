const { all } = require('../../common/utils/thenable')
const generateUUID = require('../../common/utils/uuid')

const { getCompositionTree, propagateKeys } = require('../services/utils/compositionTree')

const processDeep = (callbackFn, data, entity, skipRoot, isRoot) => {
  if (!Array.isArray(data)) {
    processDeep(callbackFn, [data], entity, skipRoot, isRoot)
    return
  }

  data.forEach(entry => {
    if (!(skipRoot && isRoot)) {
      callbackFn(entry, entity, isRoot, skipRoot)
    }

    Object.keys(entity.elements || {}).forEach(key => {
      const element = entity.elements[key]

      if (element.type === 'cds.Composition' && entry[element.name]) {
        const subData = Array.isArray(entry[element.name]) ? entry[element.name] : [entry[element.name]]
        const subEntity = element._target
        processDeep(callbackFn, subData, subEntity, false, false)
      }
    })
  })
}

const _deepProcessWithDiffComposition = ({ entry, element, compositionTree, callbackFn }) => {
  const subData = Array.isArray(entry[element.name]) ? entry[element.name] : [entry[element.name]]
  const subEntity = element._target
  const compositionElement = compositionTree.compositionElements.find(({ name }) => name === element.name)

  processsDeepEnhanced({
    callbackFn,
    data: subData,
    parentEntry: entry,
    entity: subEntity,
    compositionTree: compositionElement
  })
}

const processsDeepEnhanced = ({ callbackFn, data, parentEntry, entity, compositionTree }) => {
  if (!Array.isArray(data)) {
    processsDeepEnhanced({ callbackFn, data: [data], parentEntry, entity, compositionTree })
    return
  }

  data.forEach(entry => {
    callbackFn({ entry, parentEntry, entity, compositionTree })

    Object.keys(entity.elements || {}).forEach(key => {
      const element = entity.elements[key]

      if (element.type === 'cds.Composition' && entry[element.name]) {
        _deepProcessWithDiffComposition({ entry, element, compositionTree, callbackFn })
      }
    })
  })
}

const _deeperElements = (callbackFn, entry, elements = {}) => {
  return Object.keys(elements).map(async key => {
    const element = elements[key]

    if (element.type === 'cds.Composition' && entry[element.name]) {
      const subData = Array.isArray(entry[element.name]) ? entry[element.name] : [entry[element.name]]

      return processDeepAsync(callbackFn, subData, element._target, false, false)
    }
  })
}

const processDeepAsync = async (callbackFn, data, entity, skipRoot, isRoot) => {
  if (!Array.isArray(data)) {
    return processDeepAsync(callbackFn, [data], entity, skipRoot, isRoot)
  }

  const deep = data.map(async entry => {
    if (!(skipRoot && isRoot)) {
      await callbackFn(entry, entity, isRoot)
    }

    return all(_deeperElements(callbackFn, entry, entity.elements))
  })

  return all(deep)
}

const _generateUUIDs = (elements, data, compositionTree) => {
  const customBackLinks = compositionTree && compositionTree.customBackLinks
  const entityKeys = (customBackLinks || []).map(customBackLink => customBackLink.entityKey)
  for (const column of Object.keys(elements)) {
    const col = elements[column]
    if (
      col.key &&
      col.name !== 'DraftUUID' &&
      col.type === 'cds.UUID' &&
      data[column] === undefined &&
      !entityKeys.includes(column)
    ) {
      data[column] = generateUUID()
    }
  }
}

const ensureNoDraftsSuffix = name => (name.endsWith('_drafts') ? name.slice(0, -7) : name)

const fillKeysDeep = (definitions, data, entity, generate = true) => {
  const compositionTree = getCompositionTree(definitions, ensureNoDraftsSuffix(entity.name), false, false)
  processsDeepEnhanced({
    callbackFn: ({ entry, parentEntry, entity, compositionTree }) => {
      if (generate) _generateUUIDs(entity.elements, entry, compositionTree)
      if (parentEntry) {
        const enhancedSubData = propagateKeys(entity, compositionTree, parentEntry, [entry])
        Object.assign(entry, enhancedSubData[0])
      }
    },
    data,
    entity,
    compositionTree
  })
}

module.exports = {
  processDeep,
  processDeepAsync,
  fillKeysDeep
}
