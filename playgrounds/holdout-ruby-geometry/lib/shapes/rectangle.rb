# frozen_string_literal: true

require_relative "../distance"

module Geometry
  module Shapes
    # Axis-aligned rectangle described by width and height. Provides area,
    # perimeter and a few derived measures.
    class Rectangle
      attr_reader :width, :height

      def initialize(width, height)
        raise ArgumentError, "dimensions must be positive" unless width.positive? && height.positive?

        @width = width.to_f
        @height = height.to_f
      end

      # Area of the rectangle: width * height.
      def area
        width * height
      end

      # Perimeter of the rectangle: 2 * (width + height).
      def perimeter
        2 * (width + height)
      end

      # Length of the diagonal via the euclidean distance helper.
      def diagonal
        Geometry::Distance.euclidean([0, 0], [width, height])
      end

      def square?
        width == height
      end
    end
  end
end
