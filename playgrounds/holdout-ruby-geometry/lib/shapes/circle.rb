# frozen_string_literal: true

require_relative "../transform"

module Geometry
  module Shapes
    # Circle defined by a center point and a radius. Provides area and
    # circumference, plus uniform scaling about the origin.
    class Circle
      attr_reader :center, :radius

      def initialize(center, radius)
        raise ArgumentError, "radius must be positive" unless radius.positive?

        @center = center
        @radius = radius.to_f
      end

      # Area of the disk: pi * r^2.
      def area
        Math::PI * radius**2
      end

      # Circumference (perimeter) of the circle: 2 * pi * r.
      def circumference
        2 * Math::PI * radius
      end
      alias perimeter circumference

      def diameter
        radius * 2
      end

      # Scale the circle about the origin by +factor+, returning a new Circle.
      def scale(factor)
        scaled_center = Geometry::Transform.scale(center, factor)
        Circle.new(scaled_center, radius * factor)
      end
    end
  end
end
