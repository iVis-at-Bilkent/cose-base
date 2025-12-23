var FDLayoutNode = require('layout-base').FDLayoutNode;
var IMath = require('layout-base').IMath;
var RandomSeed = require('layout-base').RandomSeed;

function CoSENode(gm, loc, size, vNode) {
  FDLayoutNode.call(this, gm, loc, size, vNode);
  this.boundaryGraph = null;
  this.last = null;
  this.iterationCountAtCorner = 0;
}

CoSENode.prototype = Object.create(FDLayoutNode.prototype);
for (var prop in FDLayoutNode) {
  CoSENode[prop] = FDLayoutNode[prop];
}

CoSENode.prototype.clearForceX = function () {
  this.springForceX = 0;
  this.repulsionForceX = 0;
  this.gravitationForceX = 0;
}

CoSENode.prototype.clearForceY = function () {
  this.springForceY = 0;
  this.repulsionForceY = 0;
  this.gravitationForceY = 0;
}

CoSENode.prototype.putRandomlyOnBoundary = function (minX, maxX, minY, maxY) {
  const width = maxX - minX;
  const height = maxY - minY;

  const perimeter = 2 * (width + height);
  let r = RandomSeed.nextDouble() * perimeter;

  let x, y;

  if (r < width) {
    x = minX + r;
    y = minY;
  } else if (r < width + height) {
    x = maxX;
    y = minY + (r - width);
  } else if (r < 2 * width + height) {
    x = maxX - (r - (width + height));
    y = maxY;
  } else {
    x = minX;
    y = maxY - (r - (2 * width + height));
  }
  this.setCenter(x, y);
};


CoSENode.prototype.location = function () {
  const graph = this.boundaryGraph;
  if (!graph) return 'none';

  const x = this.getCenterX();
  const y = this.getCenterY();

  const left = graph.getLeft();
  const right = graph.getRight();
  const top = graph.getTop();
  const bottom = graph.getBottom();

  // Use epsilon tolerance for floating-point comparisons
  const EPS = 1e-9;
  const onLeft = Math.abs(x - left) < EPS;
  const onRight = Math.abs(x - right) < EPS;
  const onTop = Math.abs(y - top) < EPS;
  const onBottom = Math.abs(y - bottom) < EPS;

  // Corners
  if (onTop && onLeft) return 'top-left';
  if (onTop && onRight) return 'top-right';
  if (onBottom && onLeft) return 'bottom-left';
  if (onBottom && onRight) return 'bottom-right';

  // Edges
  if (onTop) return 'top';
  if (onBottom) return 'bottom';
  if (onLeft) return 'left';
  if (onRight) return 'right';

  return 'none';
};


CoSENode.prototype.calculateDisplacement = function () {
  var layout = this.graphManager.getLayout();
  // this check is for compound nodes that contain fixed nodes
  if (this.getChild() != null && this.fixedNodeWeight) {
    this.displacementX += layout.coolingFactor *
      (this.springForceX + this.repulsionForceX + this.gravitationForceX) / this.fixedNodeWeight;
    this.displacementY += layout.coolingFactor *
      (this.springForceY + this.repulsionForceY + this.gravitationForceY) / this.fixedNodeWeight;
  }
  else {
    this.displacementX += layout.coolingFactor *
      (this.springForceX + this.repulsionForceX + this.gravitationForceX) / this.noOfChildren;
    this.displacementY += layout.coolingFactor *
      (this.springForceY + this.repulsionForceY + this.gravitationForceY) / this.noOfChildren;
  }

  if (Math.abs(this.displacementX) > layout.coolingFactor * layout.maxNodeDisplacement) {
    this.displacementX = layout.coolingFactor * layout.maxNodeDisplacement *
      IMath.sign(this.displacementX);
  }

  if (Math.abs(this.displacementY) > layout.coolingFactor * layout.maxNodeDisplacement) {
    this.displacementY = layout.coolingFactor * layout.maxNodeDisplacement *
      IMath.sign(this.displacementY);
  }


  if (this.boundaryGraph) {
    const graph = this.boundaryGraph;

    const left = graph.getLeft();
    const right = graph.getRight();
    const top = graph.getTop();
    const bottom = graph.getBottom();

    const x = this.getCenterX();
    const y = this.getCenterY();

    const targetX = x + this.displacementX;
    const targetY = y + this.displacementY;

    let newX = targetX;
    let newY = targetY;

    // Clamp X to boundary
    if (targetX > right) {
      newX = right;
    } else if (targetX < left) {
      newX = left;
    }
    // Clamp Y to boundary
    if (targetY > bottom) {
      newY = bottom;
    } else if (targetY < top) {
      newY = top;
    }

    // Snap to nearest edge if node drifted inside the boundary
    const distToLeft = Math.abs(newX - left);
    const distToRight = Math.abs(newX - right);
    const distToTop = Math.abs(newY - top);
    const distToBottom = Math.abs(newY - bottom);

    const minDistX = Math.min(distToLeft, distToRight);
    const minDistY = Math.min(distToTop, distToBottom);

    // If not already on an edge, snap to the nearest one
    if (minDistX > 0 && minDistY > 0) {
      if (minDistX <= minDistY) {
        newX = (distToLeft < distToRight) ? left : right;
      } else {
        newY = (distToTop < distToBottom) ? top : bottom;
      }
    }

    this.displacementX = newX - x;
    this.displacementY = newY - y;
  }

  // non-empty compound node, propogate movement to children as well
  if (this.child && this.child.getNodes().length > 0) {
    this.propogateDisplacementToChildren(this.displacementX,
      this.displacementY);
  }
};

CoSENode.prototype.propogateDisplacementToChildren = function (dX, dY) {
  var nodes = this.child.getNodes();

  var node;
  for (var i = 0; i < nodes.length; i++) {
    node = nodes[i];
    if (node.boundaryGraph) {
      continue;
    }
    if (node.getChild() == null) {
      node.displacementX += dX;
      node.displacementY += dY;
    }
    else {
      node.propogateDisplacementToChildren(dX, dY);
    }
  }
};

CoSENode.prototype.move = function () {
  var layout = this.graphManager.getLayout();

  // a simple node or an empty compound node, move it
  if (this.child == null || this.child.getNodes().length == 0) {
    this.moveBy(this.displacementX, this.displacementY);

    layout.totalDisplacement += Math.abs(this.displacementX) + Math.abs(this.displacementY);
  }

  this.springForceX = 0;
  this.springForceY = 0;
  this.repulsionForceX = 0;
  this.repulsionForceY = 0;
  this.gravitationForceX = 0;
  this.gravitationForceY = 0;
  this.displacementX = 0;
  this.displacementY = 0;
};

CoSENode.prototype.setPred1 = function (pred1) {
  this.pred1 = pred1;
};

CoSENode.prototype.getPred1 = function () {
  return pred1;
};

CoSENode.prototype.getPred2 = function () {
  return pred2;
};

CoSENode.prototype.setNext = function (next) {
  this.next = next;
};

CoSENode.prototype.getNext = function () {
  return next;
};

CoSENode.prototype.setProcessed = function (processed) {
  this.processed = processed;
};

CoSENode.prototype.isProcessed = function () {
  return processed;
};

module.exports = CoSENode;
