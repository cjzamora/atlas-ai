# frozen_string_literal: true

require_relative "../../lib/shapes/rectangle"

RSpec.describe Geometry::Shapes::Rectangle do
  subject(:rect) { described_class.new(3.0, 4.0) }

  describe "#area" do
    it "computes width * height" do
      expect(rect.area).to eq(12.0)
    end
  end

  describe "#perimeter" do
    it "computes 2 * (width + height)" do
      expect(rect.perimeter).to eq(14.0)
    end
  end

  describe "#diagonal" do
    it "computes the euclidean diagonal" do
      expect(rect.diagonal).to be_within(1e-9).of(5.0)
    end
  end

  describe "#square?" do
    it "is false for unequal sides" do
      expect(rect.square?).to be(false)
    end

    it "is true for equal sides" do
      expect(described_class.new(2.0, 2.0).square?).to be(true)
    end
  end
end
