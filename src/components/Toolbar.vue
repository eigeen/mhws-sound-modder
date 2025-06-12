<script lang="ts" setup>
import { computed, ref } from 'vue'

const isSearchExpanded = defineModel('isSearchExpanded', {
  type: Boolean,
  required: true,
})
const searchKeyword = defineModel('searchKeyword', {
  type: String,
  required: true,
})

const props = defineProps<{
  searchSource: string[]
}>()
const emit = defineEmits<{
  searchFocus: [total: number, current: number]
}>()

const searchResults = ref<number[]>([])
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
  if (keyword) {
    const results: number[] = []
    props.searchSource.forEach((item, index) => {
      if (item.toLowerCase().includes(keyword)) {
        results.push(index)
      }
    })
    searchResults.value = results
    currentFocusIndex.value = 0
  }
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <v-text-field
        density="compact"
        variant="outlined"
        placeholder="Unimplemented"
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
                  emit('searchFocus', searchResultCount, currentFocusIndex)
                  focusIndexWrappingAdd(-1)
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
                  emit('searchFocus', searchResultCount, currentFocusIndex)
                  focusIndexWrappingAdd(1)
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
