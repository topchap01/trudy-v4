/* eslint-disable react-refresh/only-export-components */
import { useCallback } from 'react'
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function DraggableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  )
}

export function DraggableColumn({ items, onReorder, children, onDrop, lane }) {
  const sensors = useDragSensors()
  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(items, oldIndex, newIndex)
    onReorder(reordered)
    if (typeof onDrop === 'function') {
      onDrop({ activeId: active.id, overId: over.id, ordered: reordered, lane })
    }
  }, [items, onReorder, onDrop, lane])
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={rectSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}
