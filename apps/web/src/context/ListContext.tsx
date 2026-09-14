import { createContext, useContext, type ReactNode } from 'react';
import { useList } from '../hooks/useList';

type ListContextValue = ReturnType<typeof useList>;

const ListContext = createContext<ListContextValue | null>(null);

// Calls useList(listId) exactly once per list and shares the result down the tree — tasks/08.
// Before this, every one of useList's 13 return values was threaded through ListPage as props to
// TodoList (11 props) and on to TodoItem (10 props), most of them existing only to be re-passed
// one level further down.
export function ListProvider({ listId, children }: { listId: string; children: ReactNode }) {
  const list = useList(listId);
  return <ListContext.Provider value={list}>{children}</ListContext.Provider>;
}

export function useListContext(): ListContextValue {
  const context = useContext(ListContext);
  if (!context) throw new Error('useListContext must be used within a ListProvider');
  return context;
}

// The subset of useListContext() that TodoItem/SubtaskItem actually need: the mutation triggers,
// not the query/notice state. They build their own calls from their own `todo`/`subtask` prop
// (e.g. `toggleTodo.mutate({ todoId: todo.id, done: !todo.done })`) instead of receiving
// per-todo-bound callback props from above — the prop surface tasks/08 set out to collapse to just
// `todo`/`subtask`.
export function useListActions() {
  const {
    toggleTodo,
    updateTodoDescription,
    updateTodoCost,
    deleteTodo,
    reorderTodo,
    createSubTask,
    toggleSubTask,
    updateSubTaskCost,
    reorderSubTask,
    deleteSubTask,
  } = useListContext();
  return {
    toggleTodo,
    updateTodoDescription,
    updateTodoCost,
    deleteTodo,
    reorderTodo,
    createSubTask,
    toggleSubTask,
    updateSubTaskCost,
    reorderSubTask,
    deleteSubTask,
  };
}
