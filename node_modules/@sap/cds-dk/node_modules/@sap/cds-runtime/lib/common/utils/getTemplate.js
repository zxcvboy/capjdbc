const _isNavigation = element => {
  return element.type === 'cds.Composition' || element.type === 'cds.Association'
}

const _addSubTemplate = (elementName, subTemplate, templateElements) => {
  if (subTemplate.elements.size > 0) {
    templateElements.set(elementName, subTemplate)
  }
}
/**
 *
 * @param {CSN} model: Model
 * @param {String} targetName: Name of target entity which needs to be traversed
 * @param {*} param1.pick: Function to pick items. If it returns a truthy value, the item will be picked. The returned value is part of the template.
 * @param {*} param1.ignore: Function to ignore items. If it returns a truthy value, the item will be ignored.
 * @param {*} param1.includeNavigations: If true, then the pick function is also called for navigations. The result value is ignored.
 * @param {*} entityMap: Internal - do not use
 */

const getTemplate = (
  model,
  targetName,
  { pick, ignore, includeNavigations = false },
  entityMap = new Map(),
  parent = null
) => {
  const target = model.definitions[targetName]
  const templateElements = new Map()
  const template = { target, elements: templateElements, isTemplate: true }
  entityMap.set(targetName, template)
  for (const elementName of Object.keys(target.elements)) {
    const element = target.elements[elementName]
    if (ignore && ignore(element, target, parent)) continue
    if (_isNavigation(element)) {
      if (includeNavigations) {
        pick(element, target, parent, templateElements)
      }
      const cache = entityMap.get(element.target)
      if (cache) {
        templateElements.set(elementName, cache)
        continue
      }
      const subTemplate = getTemplate(model, element.target, { pick, ignore, includeNavigations }, entityMap, target)
      _addSubTemplate(elementName, subTemplate, templateElements)
      continue
    }
    const picked = pick(element, target, parent, templateElements)
    if (picked) templateElements.set(elementName, picked)
  }
  return template
}

module.exports = getTemplate
