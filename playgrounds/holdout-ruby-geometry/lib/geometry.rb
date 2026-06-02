# frozen_string_literal: true

# Geometry is a small 2D geometry library providing shapes, distance
# helpers and affine point transforms. Requiring this file pulls in the
# full public surface of the library.
require_relative "distance"
require_relative "transform"
require_relative "shapes/circle"
require_relative "shapes/rectangle"
require_relative "shapes/polygon"

module Geometry
  VERSION = "0.1.0"

  # A plain (x, y) point used throughout the library.
  Point = Struct.new(:x, :y) do
    def to_a
      [x, y]
    end
  end

  module_function

  # Convenience constructor so callers can write Geometry.point(1, 2).
  def point(x, y)
    Point.new(x, y)
  end
end
