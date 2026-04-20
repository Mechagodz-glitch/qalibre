const componentStandardTestCaseLibrary = {
  dropdown: [
    'Verify that the single-select dropdown is visible on page load and is positioned correctly as per design.',
    'Verify that the dropdown shows the default selected option on initial load when a default value is configured.',
    'Verify that the dropdown shows placeholder text when no default value is configured and a selection is required.',
    'Verify that clicking the dropdown opens the list of available options.',
    'Verify that clicking outside the open dropdown closes it without changing the current selection.',
    'Verify that selecting an option closes the dropdown and displays the selected value in the field.',
    'Verify that only one option can be selected at a time.',
    'Verify that selecting a new option replaces the previously selected option.',
    'Verify that changing the selected option refreshes dependent page data correctly.',
    'Verify that the selected option is reflected consistently across related widgets, charts, tables, and filters on the page.',
    'Verify that dropdown options match the values returned by the configured source.',
    'Verify that long option names display correctly without overflowing the field or option panel.',
    'Verify that special characters, numbers, slashes, hyphens, and ampersands in option names render and remain selectable correctly.',
    'Verify that the dropdown supports keyboard navigation for opening, moving through options, selecting a value, and closing the panel.',
    'Verify that the dropdown can be operated using only the keyboard.',
    'Verify that the selected option is announced correctly for accessibility tools.',
    'Verify that disabled options, if supported, are visually distinguishable and cannot be selected.',
    'Verify that the dropdown search filters options correctly when search is supported.',
    'Verify that rapidly clicking the dropdown multiple times does not freeze the UI or open multiple overlays.',
    'Verify that selecting the same option again does not trigger unnecessary duplicate refreshes or API calls unless explicitly designed.',
    'Verify that if the options API is still loading, the dropdown does not allow invalid interaction.',
    'Verify that if the options API fails, the dropdown shows an appropriate error or disabled state.',
    'Verify that if no options are available, the dropdown shows a clear empty state instead of breaking the page.',
    'Verify that invalid option values returned from the backend do not break the dropdown and fall back safely.',
    'Verify that if the selected option has no associated data, the page shows a correct no-data state instead of stale results.',
    'Verify that reopening the dropdown after a selection highlights the currently selected option correctly.',
    'Verify that the dropdown repositions correctly near viewport edges or inside scrollable containers.',
    'Verify that the dropdown behaves correctly across supported browsers, responsive layouts, and browser zoom levels.',
  ],
  multiselect: [
    'Verify that the multi-select dropdown is visible on the page and shows the default label on initial load.',
    'Verify that clicking the multi-select dropdown opens the list and shows Select All followed by available options when that behavior is supported.',
    'Verify that clicking the multi-select dropdown again closes the list.',
    'Verify that clicking outside the dropdown closes it without losing the current selection.',
    'Verify that the dropdown arrow or indicator updates correctly when the panel opens and closes.',
    'Verify that Select All is checked by default on initial load when all options are selected by design.',
    'Verify that all individual options are checked by default when Select All is checked.',
    'Verify that checking Select All selects all individual options.',
    'Verify that unchecking a single option automatically unchecks Select All.',
    'Verify that rechecking all individual options manually automatically checks Select All.',
    'Verify that multiple individual options can be selected at the same time.',
    'Verify that selecting a single specific option filters dependent widgets to show data only for that option.',
    'Verify that selecting multiple options filters dependent widgets to show combined data only for the selected options.',
    'Verify that deselecting a selected option removes that option from dependent widgets.',
    'Verify that changing the selection triggers a refresh for all dependent widgets.',
    'Verify that all widgets update consistently and use the exact same selected option set after changes.',
    'Verify that the user cannot deselect the last remaining selected option when at least one selection is mandatory.',
    'Verify that at least one option remains selected at all times when the control requires a non-empty state.',
    'Verify that changing the date range updates data for the currently selected options without resetting the multi-select state.',
    'Verify that changing the multi-select options updates data for the currently selected date range without resetting the date range.',
    'Verify that applying a custom date range while multiple options are selected reflects the correct combined filter across all widgets.',
    'Verify that changing options after selecting a custom date range refreshes data correctly without stale values from the previous option set.',
    'Verify that rapid successive selection changes do not cause inconsistent, stale, duplicated, or partially updated data in widgets.',
    'Verify that rapid successive changes in both the multi-select options and date range do not break page-level filter synchronization.',
    'Verify that the dropdown supports vertical scrolling when the number of options exceeds the visible panel height.',
    'Verify that long option names are displayed correctly without overlapping adjacent UI elements or breaking the dropdown layout.',
    'Verify that option names with special characters, numbers, slashes, ampersands, hyphens, or parentheses render correctly and remain selectable.',
    'Verify that duplicate option names are not shown unless they represent distinct valid records by design.',
    'Verify that the control handles a large number of options without lag, frozen UI, or delayed checkbox updates.',
    'Verify that keyboard navigation works correctly for opening the multi-select, moving between options, selecting or unselecting values, and closing the panel.',
    'Verify that focus is managed correctly when opening and closing the multi-select using keyboard interaction.',
    'Verify that accessibility labels identify the multi-select control, Select All, and individual checkboxes correctly.',
    'Verify that if the option list is loading, the multi-select shows a proper loading state and prevents invalid interaction.',
    'Verify that if the option list API fails, the multi-select shows a graceful error or empty state and does not break the page.',
    'Verify that when no options are available, the multi-select shows an appropriate empty or disabled state with clear messaging.',
    'Verify that unauthorized options are not displayed for the logged-in user.',
    'Verify that reopening the multi-select after making selections reflects the latest checkbox state for Select All and all individual options.',
    'Verify that selecting the same state again does not trigger unnecessary duplicate API calls or redundant data refreshes.',
    'Verify that totals, charts, and counts always match the exact set of currently selected options and never include deselected values.',
    'Verify that if the latest selected option set returns no data, the page shows a correct no-data state instead of stale results.',
    'Verify that changing the selection while a previous refresh is still in progress resolves to the latest selected state and does not show outdated responses.',
    'Verify that the multi-select remains usable and correctly aligned across supported resolutions, zoom levels, and responsive layouts.',
  ],
  datePicker: [
    'Verify that the single date picker is visible on the page with a calendar icon and input field.',
    'Verify that on initial load the date picker defaults to the configured date, such as yesterday, when that behavior is expected.',
    'Verify that clicking the date input opens the calendar popup.',
    'Verify that clicking the calendar icon opens the calendar popup.',
    'Verify that clicking outside the calendar popup closes it without changing the selected date.',
    'Verify that clicking the date input again toggles the calendar popup closed when that behavior is supported.',
    'Verify that the calendar popup opens aligned to the input field and does not overlap critical UI elements.',
    'Verify that the calendar header displays the correct month and year.',
    'Verify that clicking the previous-month arrow navigates to the previous month.',
    'Verify that clicking the next-month arrow navigates to the next month.',
    'Verify that navigating between months does not change the selected date until a new date is chosen.',
    'Verify that clicking the month-year header opens the month or year selection view when that behavior is supported.',
    'Verify that selecting a year updates the calendar to that year.',
    'Verify that selecting a month updates the calendar to that month.',
    'Verify that switching between month and year views works without UI glitches.',
    'Verify that selecting a date updates the input field immediately with the selected date.',
    'Verify that only one date can be selected at a time.',
    'Verify that the selected date is visually highlighted in the calendar.',
    'Verify that reopening the calendar shows the currently selected date highlighted.',
    'Verify that today and all future dates are disabled when future selection is not allowed.',
    'Verify that selecting a disabled date is not possible through mouse or keyboard interaction.',
    'Verify that the date picker respects the configured timezone and does not shift the selected date unexpectedly.',
    'Verify that selecting a new date triggers a refresh across all dependent widgets.',
    'Verify that loaders are shown while refreshed data is being fetched after the date change.',
    'Verify that all widgets update consistently based on the selected date.',
    'Verify that no stale data is shown after changing the date.',
    'Verify that rapid date changes do not cause inconsistent UI state or stale data.',
    'Verify that selecting dates across month and year boundaries works correctly.',
    'Verify that leap-year dates are handled correctly when applicable.',
    'Verify that the date picker does not allow invalid manual typing when the control is calendar-only.',
    'Verify that forced invalid input does not break the component.',
    'Verify that selecting a date with no data shows a proper no-data state.',
    'Verify that changing the date does not reset other active filters unexpectedly.',
    'Verify that changing other filters does not reset the selected date unexpectedly.',
    'Verify that refreshing the page retains the selected date when persistence is supported, otherwise it returns to the defined default date.',
    'Verify that the date picker is keyboard accessible for focusing, opening, navigating dates, selecting a date, and closing the popup.',
    'Verify that focus management is handled correctly when opening and closing the calendar popup.',
    'Verify that the date picker renders correctly across supported screen sizes and zoom levels.',
    'Verify that API failures during date changes show safe fallback states without breaking the UI.',
    'Verify that selecting the same date again does not trigger unnecessary duplicate API calls.',
  ],
  dateRangePicker: [
    'Verify that the date range picker is visible on the page with a calendar icon and input field.',
    'Verify that on initial load the date range input displays the configured default range.',
    'Verify that clicking the date range input opens the calendar popup.',
    'Verify that clicking the calendar icon opens the calendar popup.',
    'Verify that clicking outside the calendar popup closes it without changing the selected range.',
    'Verify that clicking the date range input again toggles the calendar popup closed when supported.',
    'Verify that the calendar popup opens aligned with the input field and does not overlap critical UI elements.',
    'Verify that the calendar header displays the correct current month and year.',
    'Verify that clicking the left arrow navigates to the previous month.',
    'Verify that clicking the right arrow navigates to the next month.',
    'Verify that navigating between months does not change the applied range until a new selection is completed.',
    'Verify that clicking the month-year header opens the month or year selection view when that behavior is supported.',
    'Verify that selecting a year updates the calendar to the selected year.',
    'Verify that selecting a month updates the calendar to the selected month.',
    'Verify that switching between month and year views works without UI glitches or incorrect rendering.',
    'Verify that selecting a single date sets both the start date and end date to that same day when single-day ranges are supported.',
    'Verify that the input field reflects a single-day range correctly.',
    'Verify that selecting a start date followed by a valid end date sets a proper date range.',
    'Verify that selecting an end date earlier than the start date resolves to a valid range according to design.',
    'Verify that selecting the same date twice results in a valid single-day range.',
    'Verify that selecting a date range within the same month highlights all dates between the start and end correctly.',
    'Verify that selecting a date range across multiple months highlights the full range correctly.',
    'Verify that selecting a date range across different years highlights the full range correctly.',
    'Verify that the start date and end date are visually distinguished from the in-range dates.',
    'Verify that the selected range remains highlighted when reopening the calendar.',
    'Verify that the date range input updates immediately after selecting a valid range.',
    'Verify that changing the date range triggers data refresh across all dependent widgets.',
    'Verify that loaders are displayed while new data is being fetched after the date change.',
    'Verify that all widgets update consistently based on the selected date range.',
    'Verify that no stale data is displayed after changing the date range.',
    'Verify that rapid changes in date range selection do not cause inconsistent UI state or incorrect data.',
    'Verify that future dates are disabled when future range selection is not allowed.',
    'Verify that selecting dates far in the past works correctly without performance degradation.',
    'Verify that leap-year dates are selectable and handled correctly when applicable.',
    'Verify that manual typing is blocked or safely handled when the picker is intended to be calendar-driven.',
    'Verify that changing the date range respects the currently selected filter set, such as unit or zone, and updates data accordingly.',
    'Verify that changing another filter respects the currently selected date range and updates data accordingly.',
    'Verify that reopening or refreshing the page restores the expected default range when persistence is not enabled.',
    'Verify that date range selection remains consistent across navigation when persistence is enabled.',
    'Verify that the calendar is responsive and renders correctly across different screen sizes and zoom levels.',
    'Verify that keyboard navigation works for opening the picker, navigating dates, selecting the range, and closing the popup.',
    'Verify that focus management works correctly when opening and closing the calendar popup.',
    'Verify that API failures during date changes do not break the UI and instead show appropriate fallback states.',
    'Verify that selecting the same range again does not trigger unnecessary duplicate API calls.',
  ],
  textInput: [
    'Verify that the text input field is visible on the page with the expected label and placeholder.',
    'Verify that clicking into the text input places the cursor in the field and shows the correct focus style.',
    'Verify that the user can enter valid text and the value appears exactly as typed.',
    'Verify that clearing the field removes the current value without breaking surrounding layout.',
    'Verify that the field shows the configured default value on load when one is expected.',
    'Verify that the field shows placeholder text when no value has been entered.',
    'Verify that required validation appears when the field is mandatory and left empty.',
    'Verify that minimum and maximum length validation works according to configuration.',
    'Verify that invalid characters are blocked or validated correctly according to design.',
    'Verify that leading and trailing whitespace is handled consistently according to design.',
    'Verify that pasted text is accepted and normalized correctly.',
    'Verify that long text does not overflow the field or break surrounding layout.',
    'Verify that the field remains read-only when configured as read-only.',
    'Verify that the field cannot be edited when configured as disabled.',
    'Verify that changing the text value updates dependent validation or page behavior correctly.',
    'Verify that pressing Tab moves focus to the next expected control in the correct order.',
    'Verify that keyboard shortcuts such as copy, paste, select all, and delete behave correctly in the field.',
    'Verify that accessibility labels identify the text input clearly for assistive tools.',
    'Verify that the field handles special characters safely and does not execute HTML or script-like input.',
    'Verify that refreshing the page preserves the entered value when persistence is supported, otherwise the field resets to the defined default state.',
    'Verify that if a save or submit action fails, the field keeps the entered text and shows safe feedback.',
    'Verify that the field remains usable across supported browsers, responsive layouts, and browser zoom levels.',
  ],
  textarea: [
    'Verify that the text area is visible on the page with the expected label and placeholder.',
    'Verify that clicking into the text area places the cursor correctly and shows the expected focus style.',
    'Verify that the user can enter multi-line text and line breaks are preserved correctly.',
    'Verify that pasted multi-line content is accepted and displayed correctly.',
    'Verify that clearing the text area removes the current value without leaving stale content.',
    'Verify that the field shows a default value on load when one is configured.',
    'Verify that the field shows placeholder text when no value has been entered.',
    'Verify that required validation appears when the text area is mandatory and left empty.',
    'Verify that maximum length validation works correctly for long content.',
    'Verify that long content does not overlap surrounding elements or break layout.',
    'Verify that scrolling inside the text area works correctly when content exceeds the visible height.',
    'Verify that automatic resizing behaves correctly when autosize is supported.',
    'Verify that the text area remains read-only when configured as read-only.',
    'Verify that the text area cannot be edited when configured as disabled.',
    'Verify that leading, trailing, and repeated line breaks are handled consistently according to design.',
    'Verify that keyboard navigation, including Tab and Shift+Tab, works correctly around the text area.',
    'Verify that accessibility labels identify the text area clearly for assistive tools.',
    'Verify that special characters and HTML-like input are displayed safely as text and do not execute.',
    'Verify that failed save or submit actions do not erase the entered content.',
    'Verify that the text area remains usable across supported browsers, responsive layouts, and browser zoom levels.',
  ],
  pagination: [
    'Verify that the pagination control is visible when the total number of records exceeds the configured page size.',
    'Verify that the pagination control is hidden when all records fit on a single page.',
    'Verify that the correct current page number is shown on initial load.',
    'Verify that the total number of pages is calculated correctly from the record count and page size.',
    'Verify that the first page of data is loaded by default on initial page load.',
    'Verify that clicking Next loads the next page of records correctly.',
    'Verify that clicking Previous loads the previous page of records correctly.',
    'Verify that clicking a specific page number loads the corresponding page of records.',
    'Verify that the First control navigates to page 1 when that control exists.',
    'Verify that the Last control navigates to the final page when that control exists.',
    'Verify that the Next control is disabled on the last page.',
    'Verify that the Previous control is disabled on the first page.',
    'Verify that the current page number is visually highlighted as active.',
    'Verify that the correct subset of records is displayed for each page without duplication or omission.',
    'Verify that records are not repeated across adjacent pages unless intended by design.',
    'Verify that navigating between pages preserves active filters and sorting.',
    'Verify that navigating between pages does not reset other page state such as selected filters or view mode.',
    'Verify that the page resets to page 1 when a filter, search term, or sort order changes and the dataset refreshes.',
    'Verify that the pagination range indicator displays the correct record span for the current page.',
    'Verify that the last page shows the correct remaining record count when it contains fewer than the standard page size.',
    'Verify that rapid clicks on Next or Previous do not cause duplicate requests, skipped pages, or broken UI state.',
    'Verify that pagination behaves correctly when the total record count is zero and shows an appropriate empty state.',
    'Verify that pagination handles dynamic record count changes correctly after filters are updated.',
    'Verify that a loading state is shown while a new page is being fetched.',
    'Verify that stale data from the previous page is not displayed after navigating to a new page.',
    'Verify that invalid page numbers from URL state or backend responses fall back safely to a valid page.',
    'Verify that pagination controls remain aligned and usable across supported screen sizes, resolutions, and browser zoom levels.',
    'Verify that page numbers and controls are keyboard accessible and focusable.',
    'Verify that pressing Enter or Space on a focused pagination control triggers the expected navigation.',
    'Verify that focus management after page navigation remains accessible and predictable.',
    'Verify that screen readers announce pagination controls and the active page correctly.',
    'Verify that refreshing the page retains the current page when persistence is supported, otherwise it resets to the default page.',
    'Verify that changing page size recalculates total pages and reloads records correctly when page-size controls are supported.',
    'Verify that pagination does not trigger unnecessary duplicate API calls for the same page.',
    'Verify that API failures during page navigation show an appropriate error state without losing the last stable page view.',
    'Verify that pagination remains responsive and performant with large datasets.',
  ],
} as const;

type ComponentStandardTestCaseKey = keyof typeof componentStandardTestCaseLibrary;

const explicitKeyLookup: Record<string, ComponentStandardTestCaseKey> = {
  dropdown: 'dropdown',
  'single select dropdown': 'dropdown',
  'single-select dropdown': 'dropdown',
  select: 'dropdown',
  'single select': 'dropdown',
  multiselect: 'multiselect',
  'multi select': 'multiselect',
  'multi-select': 'multiselect',
  'multiselect dropdown': 'multiselect',
  'multi select dropdown': 'multiselect',
  'multi-select dropdown': 'multiselect',
  'tag picker': 'multiselect',
  'date picker': 'datePicker',
  'single date picker': 'datePicker',
  'calendar picker': 'datePicker',
  'date selector': 'datePicker',
  'date range picker': 'dateRangePicker',
  'range calendar': 'dateRangePicker',
  'date span picker': 'dateRangePicker',
  'shared date range picker': 'dateRangePicker',
  'text input': 'textInput',
  'text input field': 'textInput',
  'input field': 'textInput',
  'single line input': 'textInput',
  textarea: 'textarea',
  'text area': 'textarea',
  'multi-line input': 'textarea',
  'rich text plain field': 'textarea',
  pagination: 'pagination',
  pager: 'pagination',
  'page controls': 'pagination',
};

function normalizeComponentKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveComponentStandardTestCaseKey(candidate: string): ComponentStandardTestCaseKey | null {
  const normalized = normalizeComponentKey(candidate);

  if (!normalized) {
    return null;
  }

  const explicit = explicitKeyLookup[normalized];
  if (explicit) {
    return explicit;
  }

  if ((normalized.includes('multi') || normalized.includes('tag')) && normalized.includes('select')) {
    return 'multiselect';
  }

  if (normalized.includes('date') && normalized.includes('range')) {
    return 'dateRangePicker';
  }

  if (normalized.includes('date') && (normalized.includes('picker') || normalized.includes('calendar'))) {
    return 'datePicker';
  }

  if (normalized.includes('text area') || normalized.includes('textarea') || normalized.includes('multi-line')) {
    return 'textarea';
  }

  if (
    normalized.includes('text input') ||
    normalized.includes('input field') ||
    normalized.includes('single line input')
  ) {
    return 'textInput';
  }

  if (normalized.includes('pagination') || normalized.includes('pager') || normalized.includes('page control')) {
    return 'pagination';
  }

  if (normalized.includes('dropdown')) {
    return 'dropdown';
  }

  return null;
}

export function getDefaultComponentStandardTestCases(name: unknown, aliases: unknown = []): string[] {
  const candidates = [
    typeof name === 'string' ? name : '',
    ...(Array.isArray(aliases) ? aliases.filter((value): value is string => typeof value === 'string') : []),
  ];

  for (const candidate of candidates) {
    const key = resolveComponentStandardTestCaseKey(candidate);
    if (key) {
      return [...componentStandardTestCaseLibrary[key]];
    }
  }

  return [];
}
