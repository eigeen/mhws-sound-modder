<script lang="ts" setup>
import { computed, ref } from 'vue'

export type SearchSource = {
  text: string
  children: SearchSource[]
}

export interface SearchResult {
  path: Array<number>
}

const isSearchExpanded = defineModel('isSearchExpanded', {
  type: Boolean,
  required: true,
})
const searchKeyword = defineModel('searchKeyword', {
  type: String,
  required: true,
})

const props = defineProps<{
  searchSource: SearchSource
}>()
const emit = defineEmits<{
  searchFocus: [total: number, current: number, result: SearchResult]
}>()

const searchResults = ref<SearchResult[]>([])
const currentFocusIndex = ref(0)
const searchResultCount = computed(() => searchResults.value.length)

function toggleSearchExpansion() {
  isSearchExpanded.value = !isSearchExpanded.value
}

function focusIndexWrappingAdd(delta: number) {
  currentFocusIndex.value =
    (currentFocusIndex.value + delta + searchResultCount.value) %
    searchResultCount.value
}

/**
 * Search results, and focus on first item
 */
function doSearch() {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    // off search mode
    searchResults.value = []
    currentFocusIndex.value = 0
    return
  }

  const results = searchFromSource(props.searchSource, (item) => {
    const searchTarget = item
    if (searchTarget.trim().toLowerCase().includes(keyword)) {
      return true
    }
    return false
  })
  searchResults.value = results
  currentFocusIndex.value = 0
  // emit search focus event
  if (searchResultCount.value > 0) {
    const indexInSource = searchResults.value[currentFocusIndex.value]
    emit(
      'searchFocus',
      searchResultCount.value,
      currentFocusIndex.value,
      indexInSource
    )
  }
}

function searchFromSource(
  source: SearchSource,
  predicate: (item: string) => boolean
): SearchResult[] {
  const results: SearchResult[] = []

  function dfs(
    index: number,
    value: SearchSource,
    path: number[]
  ) {
    const currentPath = [...path, index]

    if (predicate(value.text)) {
      results.push({
        path: currentPath,
      })
    }
    value.children.forEach((item, index) => {
      dfs(index, item, currentPath)
    })
  }

  source.children.forEach((item, index) => {
    dfs(index, item, [])
  })
  return results
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <v-text-field
        density="compact"
        variant="outlined"
        placeholder="Database Search"
        prepend-inner-icon="mdi-magnify"
        hide-details
        single-line
      ></v-text-field>
    </div>

    <div class="toolbar-right">
      <v-btn
        :icon="isSearchExpanded ? 'mdi-chevron-right' : 'mdi-magnify'"
        variant="text"
        density="comfortable"
        @click="toggleSearchExpansion"
      ></v-btn>

      <v-expand-x-transition>
        <div
          v-show="isSearchExpanded"
          class="search-expanded"
        >
          <v-text-field
            v-model="searchKeyword"
            density="compact"
            variant="outlined"
            placeholder="Search"
            hide-details
            single-line
            class="search-input"
            @keyup.enter="doSearch"
          ></v-text-field>

          <div class="search-controls">
            <span class="search-count"
              >{{ searchResultCount > 0 ? currentFocusIndex + 1 : 0 }} /
              {{ searchResultCount }}</span
            >
            <v-btn
              icon="mdi-chevron-up"
              variant="text"
              density="comfortable"
              :disabled="!searchResultCount"
              @click="
                () => {
                  focusIndexWrappingAdd(-1)
                  const result = searchResults[currentFocusIndex]
                  emit(
                    'searchFocus',
                    searchResultCount,
                    currentFocusIndex,
                    result
                  )
                }
              "
            ></v-btn>
            <v-btn
              icon="mdi-chevron-down"
              variant="text"
              density="comfortable"
              :disabled="!searchResultCount"
              @click="
                () => {
                  focusIndexWrappingAdd(1)
                  const result = searchResults[currentFocusIndex]
                  emit(
                    'searchFocus',
                    searchResultCount,
                    currentFocusIndex,
                    result
                  )
                }
              "
            ></v-btn>
          </div>
        </div>
      </v-expand-x-transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.toolbar-left {
  flex: 1;
  max-width: 300px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-expanded {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.search-input {
  width: 200px;
  flex-shrink: 0;
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.875rem;
}

.search-count {
  margin: 0 4px;
}
</style>
