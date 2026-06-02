# frozen_string_literal: true

require_relative "../lib/transform"

RSpec.describe Geometry::Transform do
  describe ".translate" do
    it "shifts a point by (dx, dy)" do
      expect(described_class.translate([1, 2], 3, -1)).to eq([4, 1])
    end
  end

  describe ".scale" do
    it "scales uniformly about the origin" do
      expect(described_class.scale([2, 3], 2)).to eq([4, 6])
    end

    it "scales each axis independently" do
      expect(described_class.scale([2, 3], 2, 3)).to eq([4, 9])
    end
  end

  describe ".rotate" do
    it "rotates 90 degrees counter-clockwise about the origin" do
      x, y = described_class.rotate([1, 0], Math::PI / 2)
      expect(x).to be_within(1e-9).of(0.0)
      expect(y).to be_within(1e-9).of(1.0)
    end
  end

  describe ".rotate_around" do
    it "rotates about an arbitrary pivot" do
      x, y = described_class.rotate_around([2, 1], [1, 1], Math::PI / 2)
      expect(x).to be_within(1e-9).of(1.0)
      expect(y).to be_within(1e-9).of(2.0)
    end
  end
end
