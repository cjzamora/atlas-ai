# frozen_string_literal: true

module Geometry
  # Affine transforms for 2D points. Points may be [x, y] arrays or any
  # object responding to #to_a. Each method returns a fresh [x, y] array.
  module Transform
    module_function

    # Translate a point by (dx, dy).
    def translate(point, dx, dy)
      x, y = point.to_a
      [x + dx, y + dy]
    end

    # Scale a point about the origin. Pass one factor for uniform scaling
    # or both fx and fy for independent axes.
    def scale(point, fx, fy = nil)
      fy ||= fx
      x, y = point.to_a
      [x * fx, y * fy]
    end

    # Rotate a point about the origin by +radians+ (counter-clockwise).
    def rotate(point, radians)
      x, y = point.to_a
      cos = Math.cos(radians)
      sin = Math.sin(radians)
      [(x * cos) - (y * sin), (x * sin) + (y * cos)]
    end

    # Rotate about an arbitrary pivot by translating to the origin first.
    def rotate_around(point, pivot, radians)
      px, py = pivot.to_a
      shifted = translate(point, -px, -py)
      rotated = rotate(shifted, radians)
      translate(rotated, px, py)
    end
  end
end
