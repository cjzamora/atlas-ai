# frozen_string_literal: true

require_relative "../distance"

module Geometry
  module Shapes
    # Simple polygon described by an ordered list of [x, y] vertices.
    # Area is computed with the shoelace formula; perimeter sums the
    # euclidean edge lengths.
    class Polygon
      attr_reader :vertices

      def initialize(vertices)
        raise ArgumentError, "polygon needs at least 3 vertices" if vertices.length < 3

        @vertices = vertices.map { |v| v.to_a }
      end

      # Area via the shoelace (Gauss) formula. Returns an unsigned value.
      def area
        sum = 0.0
        vertices.each_with_index do |(x1, y1), i|
          x2, y2 = vertices[(i + 1) % vertices.length]
          sum += (x1 * y2) - (x2 * y1)
        end
        sum.abs / 2.0
      end

      # Perimeter: sum of euclidean lengths of each edge, closing the loop.
      def perimeter
        vertices.each_with_index.sum do |v, i|
          Geometry::Distance.euclidean(v, vertices[(i + 1) % vertices.length])
        end
      end

      def vertex_count
        vertices.length
      end
    end
  end
end
