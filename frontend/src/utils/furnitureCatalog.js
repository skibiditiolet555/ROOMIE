import { Armchair, Layers, Blinds, Lamp, Frame, Store } from 'lucide-react'

// Metadata for the item categories the backend can return
// (see backend/app/services/item_service.py CATEGORIES).
// Icons here are purely presentational — real item data (name, price,
// source, image) comes from the AI via src/services/roomieApi.js.
export const categories = [
  { id: 'furniture', label: 'Furniture', icon: Armchair },
  { id: 'flooring', label: 'Flooring', icon: Layers },
  { id: 'curtains', label: 'Curtains', icon: Blinds },
  { id: 'lighting', label: 'Lighting', icon: Lamp },
  { id: 'decor', label: 'Decor', icon: Frame },
]

export function iconForCategory(categoryId) {
  return categories.find((c) => c.id === categoryId)?.icon || Store
}

export function labelForCategory(categoryId) {
  return categories.find((c) => c.id === categoryId)?.label || categoryId || 'Item'
}
