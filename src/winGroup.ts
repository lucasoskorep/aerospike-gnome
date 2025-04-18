import Meta from 'gi://Meta';
import Mtk from '@girs/mtk-16';

export interface WindowTree {
  root: WindowNode | null;
  monitor: number;
  workspace: number;
}

export interface WindowNode {
  window: Meta.Window | null;
  windowId: number | null;
  children: WindowNode[];
  parent: WindowNode | null;
  splitRatio: number;
  splitDirection: 'horizontal' | 'vertical';
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function createWindowNode(window: Meta.Window | null = null): WindowNode {
  return {
    window: window,
    windowId: window ? window.get_id() : null,
    children: [],
    parent: null,
    splitRatio: 1.0,
    splitDirection: 'horizontal',
    rect: { x: 0, y: 0, width: 0, height: 0 }
  };
}

export function addNodeChild(parent: WindowNode, child: WindowNode): void {
  child.parent = parent;
  parent.children.push(child);
  
  // Update split ratios to be equal
  const childCount = parent.children.length;
  parent.children.forEach(node => {
    node.splitRatio = 1.0 / childCount;
  });
}

export function removeNode(node: WindowNode, tree: WindowTree): WindowNode | null {
  if (!node.parent) {
    // This is the root node
    if (node.children.length > 0) {
      // Promote first child to root
      const newRoot = node.children[0];
      newRoot.parent = null;
      
      // Transfer any other children to the new root
      for (let i = 1; i < node.children.length; i++) {
        addNodeChild(newRoot, node.children[i]);
      }
      
      tree.root = newRoot;
      return newRoot;
    } else {
      // No children, tree is now empty
      tree.root = null;
      return null;
    }
  } else {
    // Remove from parent's children
    const parent = node.parent;
    const index = parent.children.indexOf(node);
    if (index !== -1) {
      parent.children.splice(index, 1);
    }
    
    // Update split ratios of remaining siblings
    if (parent.children.length > 0) {
      const ratio = 1.0 / parent.children.length;
      parent.children.forEach(child => {
        child.splitRatio = ratio;
      });
    }
    
    // Transfer any children to the parent
    node.children.forEach(child => {
      addNodeChild(parent, child);
    });
    
    return parent;
  }
}

export function findNodeByWindowId(tree: WindowTree, windowId: number): WindowNode | null {
  if (!tree.root) return null;
  
  function search(node: WindowNode): WindowNode | null {
    if (node.windowId === windowId) return node;
    
    for (const child of node.children) {
      const result = search(child);
      if (result) return result;
    }
    
    return null;
  }
  
  return search(tree.root);
}

export function calculateLayout(node: WindowNode, rect: {x: number, y: number, width: number, height: number}): void {
  // Update node's rect
  node.rect = {...rect};
  
  // Process children recursively
  if (node.children.length > 0) {
    if (node.splitDirection === 'horizontal') {
      // Divide width with remainder handling
      let currentX = rect.x;
      let remainingWidth = rect.width;
      const lastChildIndex = node.children.length - 1;
      
      node.children.forEach((child, index) => {
        const isLastChild = index === lastChildIndex;
        // Last child gets remainder to avoid gaps
        const childWidth = isLastChild ? 
            remainingWidth : 
            Math.floor(rect.width * child.splitRatio);
        
        calculateLayout(child, {
          x: currentX,
          y: rect.y,
          width: childWidth,
          height: rect.height
        });
        
        currentX += childWidth;
        remainingWidth -= childWidth;
      });
    } else {
      // Divide height with remainder handling
      let currentY = rect.y;
      let remainingHeight = rect.height;
      const lastChildIndex = node.children.length - 1;
      
      node.children.forEach((child, index) => {
        const isLastChild = index === lastChildIndex;
        // Last child gets remainder to avoid gaps
        const childHeight = isLastChild ? 
            remainingHeight : 
            Math.floor(rect.height * child.splitRatio);
        
        calculateLayout(child, {
          x: rect.x,
          y: currentY,
          width: rect.width,
          height: childHeight
        });
        
        currentY += childHeight;
        remainingHeight -= childHeight;
      });
    }
  }
}