# frozen_string_literal: true

module Geometry
  # Distance metrics between two 2D points. Points may be [x, y] arrays or
  # any object responding to #to_a.
  module Distance
    module_function

    # Straight-line (L2) distance between two points.
    def euclidean(a, b)
      ax, ay = a.to_a
      bx, by = b.to_a
      Math.sqrt((ax - bx)**2 + (ay - by)**2)
    end

    # Taxicab (L1) distance: sum of absolute coordinate differences.
    def manhattan(a, b)
      ax, ay = a.to_a
      bx, by = b.to_a
      (ax - bx).abs + (ay - by).abs
    end

    # Chebyshev (L-infinity) distance: the largest coordinate difference.
    def chebyshev(a, b)
      ax, ay = a.to_a
      bx, by = b.to_a
      [(ax - bx).abs, (ay - by).abs].max
    end
  end
end
