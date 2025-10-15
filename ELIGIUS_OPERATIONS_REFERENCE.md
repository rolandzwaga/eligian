# Eligius Operations Reference

**Complete and accurate list of all operations in Eligius**
**Source**: `../eligius/src/operation/` directory
**Date**: 2025-10-14

## Total: 47 Operations

### DOM Element Operations (9)

1. **selectElement** - Select one or more elements using a selector
   - Required: `selector: string`
   - Optional: `useSelectedElementAsRoot?: boolean`
   - Output: `selectedElement: JQuery`

2. **createElement** - Create new DOM element with attributes
   - Required: `elementName: TTagNames`
   - Optional: `text?: string`, `attributes?: object`
   - Output: `template: JQuery`

3. **removeElement** - Remove selected element from DOM
   - Dependency: `selectedElement: JQuery`

4. **clearElement** - Remove all children from selected element
   - Dependency: `selectedElement: JQuery`

5. **reparentElement** - Move element to new parent
   - Dependency: `selectedElement: JQuery`
   - Required: `newParentSelector: string`

6. **toggleElement** - Toggle visibility of element
   - Dependency: `selectedElement: JQuery`

7. **setElementContent** - Set content of element
   - Dependency: `selectedElement: JQuery`, `template: string | JQuery.Node`
   - Required: `insertionType: 'overwrite' | 'append' | 'prepend'`

8. **setElementAttributes** - Set attributes on element
   - Dependency: `selectedElement: JQuery`
   - Required: `attributes: Record<string, unknown>`

9. **getAttributesFromElement** - Get attributes from element
   - Dependency: `selectedElement: JQuery`
   - Required: `attributeNames: string[]`
   - Output: `attributeValues: Record<string, unknown>`

### CSS Class Operations (3)

10. **addClass** - Add CSS class to element
    - Dependency: `selectedElement: JQuery`
    - Required: `className: string`

11. **removeClass** - Remove CSS class from element
    - Dependency: `selectedElement: JQuery`
    - Required: `className: string`

12. **toggleClass** - Toggle CSS class on element
    - Dependency: `selectedElement: JQuery`
    - Required: `className: string`

### Style & Animation Operations (3)

13. **setStyle** - Set CSS properties on element
    - Dependency: `selectedElement: JQuery`
    - Required: `properties: Record<string, any>`

14. **animate** - jQuery animate with duration and easing
    - Dependency: `selectedElement: JQuery`
    - Required: `animationProperties: Record<string, unknown>`, `animationDuration: JQuery.Duration`
    - Optional: `animationEasing?: string`

15. **animateWithClass** - Animate by adding CSS class and wait for completion
    - Dependency: `selectedElement: JQuery`
    - Required: `className: string`
    - Optional: `removeClass?: boolean`

### Element Query Operations (2)

16. **getElementDimensions** - Get width/height of element
    - Dependency: `selectedElement: JQuery`
    - Optional: `modifier?: string`
    - Output: `dimensions: {width?: number; height?: number}`

17. **getAttributesFromElement** - (Listed above in DOM operations)

### Data Management Operations (5)

18. **setData** - Assign data to context/operationdata/globaldata
    - Required: `properties: Record<TDataTarget, any>`
    - TDataTarget: `'context.${string}' | 'operationdata.${string}' | 'globaldata.${string}'`

19. **setOperationData** - Set properties on operation data
    - Required: `properties: Record<string, any>`
    - Optional: `override?: boolean`

20. **setGlobalData** - Copy properties from operation data to global data
    - Required: `propertyNames: string[]`

21. **clearOperationData** - Clear all or specific properties from operation data
    - Optional: `properties?: string[]`

22. **removePropertiesFromOperationData** - Remove specific properties from operation data
    - Required: `propertyNames: string[]`

### External Data Operations (1)

23. **loadJson** - Load JSON from URL
    - Required: `url: string`, `cache: boolean`
    - Output: `json?: any`

### Control Flow Operations (5)

24. **when** - Conditional if (start of if block)
    - Required: `expression: TExpression`
    - Expression format: `${TValue}${TOperator}${TValue}` (e.g., `"operationdata.count>5"`)
    - Operators: `!=`, `==`, `>=`, `<=`, `>`, `<`

25. **otherwise** - Else branch (middle of if/else block)
    - No parameters

26. **endWhen** - End conditional block
    - No parameters

27. **forEach** - Loop over collection
    - Required: `collection: unknown[] | string` (string = property chain reference)
    - Sets `context.currentItem` for each iteration

28. **endForEach** - End loop block
    - No parameters

### Action Management Operations (4)

29. **startAction** - Execute action instance
    - Dependency: `actionInstance: IAction`
    - Required: `actionOperationData: TOperationData`

30. **endAction** - Invoke EndableAction.end method
    - Dependency: `actionInstance: IEndableAction`
    - Required: `actionOperationData: Record<string, unknown>`

31. **requestAction** - Get action instance by name
    - Required: `systemName: string`
    - Output: `actionInstance: IAction`

32. **resizeAction** - Resize action (DEPRECATED)
    - Dependency: `actionInstance: any`
    - Required: `actionOperationData: TOperationData`

### Controller Operations (5)

33. **addControllerToElement** - Add controller to element
    - Dependency: `selectedElement: JQuery`, `controllerInstance: IController<T>`

34. **removeControllerFromElement** - Remove controller from element
    - Dependency: `selectedElement: JQuery`
    - Required: `controllerName: string`

35. **getControllerFromElement** - Get controller instance from element
    - Dependency: `selectedElement: JQuery`
    - Required: `controllerName: string`
    - Output: `controllerInstance: IController<any>`

36. **getControllerInstance** - Get new controller instance by name
    - Required: `systemName: TSystemName`
    - Output: `controllerInstance: IController<TOperationData>`

37. **extendController** - Extend controller with extension object
    - Dependency: `controllerInstance: IController<TOperationData>`
    - Required: `controllerExtension: Record<PropertyKey, unknown>`

### Math & Calculation Operations (2)

38. **calc** - Calculate using left/right operands and operator
    - Required: `left: string | number`, `right: string | number`, `operator: TCalculationOperator`
    - Operators: `+`, `-`, `*`, `/`, `%`, `**`
    - Output: `calculationResult: number`

39. **math** - Perform Math function
    - Required: `functionName: MathFunctionKeys`, `args: (number | string | MathNonFunctionKeys)[]`
    - Output: `mathResult: number`

### Utility Operations (6)

40. **log** - Log operation data, global data, and context to console
    - No parameters

41. **wait** - Wait for specified milliseconds
    - Required: `milliseconds: number`

42. **broadcastEvent** - Broadcast event through eventbus
    - Required: `eventName: string`, `eventArgs: unknown[]`
    - Optional: `eventTopic?: string`

43. **customFunction** - Invoke custom function by name
    - Required: `systemName: string`

44. **invokeObjectMethod** - Invoke method on object instance
    - Required: `instance: any`, `methodName: string`
    - Optional: `methodArguments?: unknown[]`
    - Output: `methodResult?: unknown`

45. **getImport** - Get imported instance by system name
    - Required: `systemName: string`
    - Output: `importedInstance: unknown`

46. **getQueryParams** - Get URL query parameters
    - Optional: `defaultValues?: Record<string, string>`
    - Output: `queryParams: Record<string, string>`

47. **addGlobalsToOperation** - Add global properties to operation data
    - Required: `globalProperties: string[]`

---

## Key Patterns

### Property Chain References

Operations support external property references using these prefixes:
- `operationdata.{propertyName}` - Reference data from previous operations
- `globaldata.{propertyName}` - Reference shared global data
- `context.{propertyName}` - Reference runtime context (currentItem, loopIndex, etc.)

Example (from `setData` operation):
```typescript
{
  'operationdata.targetName': 'context.currentItem.name',  // Copy context to operationdata
  'globaldata.counter': 'operationdata.count',             // Copy operationdata to global
  'context.newIndex': 100                                   // Set literal value on context
}
```

### Operation Composition

Operations chain via `operationData` - the output of one operation becomes the input of the next:

```typescript
// Operation chain pattern:
selectElement({ selector: ".box" })           // → operationData.selectedElement = jQuery
→ addClass({ className: "highlight" })         // uses operationData.selectedElement
→ animate({ animationProperties: {...} })     // uses operationData.selectedElement
```

### Dependency Pattern

Many operations mark properties with `@dependency` - these must be set by previous operations:

```typescript
// addClass requires selectedElement dependency
export interface IAddClassOperationData {
  /**
   * @dependency
   */
  selectedElement: JQuery;
  /**
   * @required
   */
  className: string;
}
```

### Output Pattern

Operations mark output properties with `@output` - these are added to operationData:

```typescript
// createElement outputs template property
export interface ICreateElementOperationData<T extends TTagNames> {
  elementName: T;
  /**
   * @type=ParameterType:object
   * @output
   */
  template?: JQuery;
}
```

### Control Flow as Operations

Control flow is NOT special syntax - it's implemented as operations:

```typescript
// Conditional pattern:
when({ expression: "operationdata.count>5" })
  // operations when true
otherwise()
  // operations when false
endWhen()

// Loop pattern:
forEach({ collection: "globaldata.items" })
  // operations for each item (context.currentItem available)
endForEach()
```

### Action Reusability Pattern

The `startAction` operation enables composing actions from other actions:

```typescript
// Define reusable action
const fadeInAction = {
  startOperations: [
    { systemName: 'selectElement', operationData: { selector: '.target' } },
    { systemName: 'setStyle', operationData: { properties: { opacity: 0 } } },
    { systemName: 'animate', operationData: { animationProperties: { opacity: 1 }, animationDuration: 500 } }
  ]
};

// Use reusable action
startAction({
  actionInstance: fadeInAction,
  actionOperationData: { selector: '.box1' }  // Override parameters
})
```

---

## Operation Context

All operations execute with access to `IOperationContext`:

```typescript
export interface IOperationContext {
  loopIndex?: number;        // Current loop iteration (forEach)
  loopLength?: number;       // Total loop iterations (forEach)
  currentIndex: number;      // Current operation index
  eventbus: IEventbus;       // Event communication bus
  operations: IResolvedOperation[];  // All operations in action
  whenEvaluation?: boolean;  // Result of when condition
  currentItem?: any;         // Current loop item (forEach)
  parent?: IOperationContext; // Parent context if nested
}
```

---

## Categories Summary

- **DOM Element**: 9 operations (select, create, remove, clear, reparent, toggle, content, attributes)
- **CSS Class**: 3 operations (add, remove, toggle)
- **Style & Animation**: 3 operations (setStyle, animate, animateWithClass)
- **Data Management**: 5 operations (setData, setOperationData, setGlobalData, clear, remove)
- **External Data**: 1 operation (loadJson)
- **Control Flow**: 5 operations (when, otherwise, endWhen, forEach, endForEach)
- **Action Management**: 4 operations (start, end, request, resize)
- **Controllers**: 5 operations (add, remove, get from element, get instance, extend)
- **Math**: 2 operations (calc, math)
- **Utilities**: 6 operations (log, wait, broadcast, custom function, invoke method, get import, query params, add globals)

**Total: 47 operations**
